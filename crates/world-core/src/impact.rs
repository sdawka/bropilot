//! Bounded advisory inference for the compiled assistant-impact@1 pack.
//! Each revision is evaluated independently; witness paths never cross revisions.
use crate::{
    ASSISTANT_IMPACT_PACK_ID, ASSISTANT_IMPACT_PACK_VERSION, AffectedObject, ChangeImpactReport,
    CompletenessDeclaration, CompletenessStatus, CoreError, CriterionImpact, Environment,
    EvidenceApplicability, EvidenceImpact, EvidenceProvenance, IMPACT_CRITERION_SCOPE,
    IMPACT_DEPENDENCY_SCOPE, IMPACT_METRIC_SCOPE, ImpactAnalysisContext, ImpactChange,
    ImpactChangeKind, ImpactDiagnostic, ImpactEntityKind, ImpactPatch, ImpactPatchOperation,
    ImpactProperty, ImpactSide, ImpactWitness, MAX_COMPLETENESS_DECLARATIONS, MAX_CONSTRAINT_RULES,
    MAX_FORBIDDEN_CYCLE_RULES, MAX_IMPACT_DERIVED_PAIRS, MAX_IMPACT_EVIDENCE_BINDINGS,
    MAX_IMPACT_PATCH_OPERATIONS, MAX_IMPACT_REPORT_BYTES, MAX_IMPACT_WITNESS_REFS,
    MAX_IMPACT_WORK_UNITS, MAX_MOVES, MAX_OBJECTS, MAX_RELATION_ENDPOINTS, MAX_RELATIONS,
    MAX_REQUEST_BYTES, MAX_REQUIRED_RELATIONS, MAX_RULE_PACKS, MAX_TEMPLATE_SHAPES,
    MAX_THEORY_CLAIMS, MAX_THING_TEMPLATES, MAX_THINGS, MetricDefinition, ModelObject,
    ModelRelation, MoveSummary, Purpose, RulePackPin, SnapshotIdentity, Source, SourceKind,
    StateKind, Theory, ThingImpact, WorldSnapshot, canonicalize_json, content_hash,
};
use ascent::ascent;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::io::{self, Write};

ascent! {
    struct ImpactProgram;
    relation seed(usize, usize);
    relation edge(usize, usize);
    relation affected(usize, usize);
    affected(cause, object) <-- seed(cause, object);
    affected(cause, dependent) <-- affected(cause, dependency), edge(dependency, dependent);
}

fn invalid(message: impl Into<String>) -> CoreError {
    CoreError::Evaluation(message.into())
}
fn limited(message: impl Into<String>) -> CoreError {
    CoreError::ResourceLimit(message.into())
}
fn factual(source: &Source) -> bool {
    matches!(source.kind, SourceKind::Declared | SourceKind::Observation)
}

struct SizeGuard {
    used: usize,
    limit: usize,
}
impl Write for SizeGuard {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.used = self.used.saturating_add(bytes.len());
        if self.used > self.limit {
            return Err(io::Error::other("serialized size exceeds limit"));
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn bounded_json(value: &impl Serialize, limit: usize, name: &str) -> Result<usize, CoreError> {
    let mut writer = SizeGuard { used: 0, limit };
    if let Err(error) = serde_json::to_writer(&mut writer, value) {
        return if writer.used > limit {
            Err(limited(format!("{name} exceeds {limit} bytes")))
        } else {
            Err(invalid(format!("{name} serialization failed: {error}")))
        };
    }
    Ok(writer.used)
}

#[allow(clippy::too_many_lines)]
fn validate_snapshot(snapshot: &WorldSnapshot) -> Result<(), CoreError> {
    for (name, count, cap) in [
        ("objects", snapshot.objects.len(), MAX_OBJECTS),
        ("relations", snapshot.relations.len(), MAX_RELATIONS),
        ("Things", snapshot.things.len(), MAX_THINGS),
        (
            "Thing Templates",
            snapshot.thing_templates.len(),
            MAX_THING_TEMPLATES,
        ),
        (
            "object shapes",
            snapshot.template.object_shapes.len(),
            MAX_TEMPLATE_SHAPES,
        ),
        (
            "relation endpoints",
            snapshot.template.allowed_relation_endpoints.len(),
            MAX_RELATION_ENDPOINTS,
        ),
        (
            "required relations",
            snapshot.template.required_relations.len(),
            MAX_REQUIRED_RELATIONS,
        ),
        (
            "cycle rules",
            snapshot.template.forbidden_cycles.len(),
            MAX_FORBIDDEN_CYCLE_RULES,
        ),
        (
            "constraint rules",
            snapshot.template.incompatible_constraints.len(),
            MAX_CONSTRAINT_RULES,
        ),
        ("rule pins", snapshot.rule_packs.len(), MAX_RULE_PACKS),
        (
            "required rule pins",
            snapshot.template.required_rule_packs.len(),
            MAX_RULE_PACKS,
        ),
        (
            "completeness",
            snapshot.completeness.len(),
            MAX_COMPLETENESS_DECLARATIONS,
        ),
        (
            "Theory claims",
            snapshot.theory.claims.len(),
            MAX_THEORY_CLAIMS,
        ),
        ("Moves", snapshot.moves.len(), MAX_MOVES),
    ] {
        if count > cap {
            return Err(limited(format!("{name} exceed {cap}")));
        }
    }
    bounded_json(snapshot, MAX_REQUEST_BYTES, "snapshot")?;
    let mut ids = BTreeSet::new();
    for id in snapshot
        .objects
        .iter()
        .map(|o| &o.id)
        .chain(snapshot.things.iter().map(|t| &t.id))
        .chain(snapshot.relations.iter().map(|r| &r.id))
    {
        if id.is_empty() || !ids.insert(id) {
            return Err(invalid(format!("empty or duplicate model identity: {id}")));
        }
    }
    let objects: BTreeSet<_> = snapshot.objects.iter().map(|o| o.id.as_str()).collect();
    let things: BTreeSet<_> = snapshot.things.iter().map(|t| t.id.as_str()).collect();
    for object in &snapshot.objects {
        if object
            .thing_id
            .as_deref()
            .is_some_and(|id| !things.contains(id))
            || object
                .parent_id
                .as_deref()
                .is_some_and(|id| !objects.contains(id))
        {
            return Err(invalid(format!(
                "object {} has unresolved ownership or parent",
                object.id
            )));
        }
    }
    for relation in &snapshot.relations {
        if !objects.contains(relation.from_id.as_str())
            || !objects.contains(relation.to_id.as_str())
        {
            return Err(invalid(format!(
                "relation {} has unresolved endpoints",
                relation.id
            )));
        }
    }
    let mut scopes = BTreeSet::new();
    for declaration in &snapshot.completeness {
        if !scopes.insert(&declaration.scope_id) {
            return Err(invalid("duplicate completeness scope"));
        }
    }
    let mut packs = BTreeSet::new();
    for pack in &snapshot.rule_packs {
        if !packs.insert(&pack.id) {
            return Err(invalid("duplicate rule pack pin"));
        }
    }
    if !snapshot
        .rule_packs
        .iter()
        .any(|p| p.id == ASSISTANT_IMPACT_PACK_ID && p.version == ASSISTANT_IMPACT_PACK_VERSION)
    {
        return Err(CoreError::NotConfigured(
            "assistant-impact@1 is not pinned".into(),
        ));
    }
    Ok(())
}

fn diagnostic(
    code: &str,
    message: impl Into<String>,
    scope: Option<&str>,
    side: ImpactSide,
    objects: Vec<String>,
) -> ImpactDiagnostic {
    ImpactDiagnostic {
        code: code.into(),
        message: message.into(),
        scope_id: scope.map(str::to_owned),
        side,
        object_ids: objects,
    }
}
fn complete_scope(snapshot: &WorldSnapshot, scope: &str) -> bool {
    snapshot.completeness.iter().any(|d| {
        d.scope_id == scope && d.status == CompletenessStatus::Complete && factual(&d.source)
    })
}
fn changed_fields<T: Serialize>(before: &T, after: &T) -> Result<Vec<String>, CoreError> {
    let a = canonicalize_json(serde_json::to_value(before).map_err(|e| invalid(e.to_string()))?);
    let b = canonicalize_json(serde_json::to_value(after).map_err(|e| invalid(e.to_string()))?);
    let (Some(a), Some(b)) = (a.as_object(), b.as_object()) else {
        return Err(invalid("diff requires typed object"));
    };
    let keys: BTreeSet<_> = a.keys().chain(b.keys()).collect();
    Ok(keys
        .into_iter()
        .filter(|k| a.get(*k) != b.get(*k))
        .cloned()
        .collect())
}
#[derive(Clone)]
struct Start {
    object_id: String,
    object_ids: Vec<String>,
    relation_ids: Vec<String>,
    rule_id: String,
}
type Seeds = BTreeMap<String, Vec<Start>>;
fn add_start(
    seeds: &mut Seeds,
    cause: &str,
    object: &ModelObject,
    relation: Option<&ModelRelation>,
    rule: &str,
) {
    if !factual(&object.source) {
        return;
    }
    let (object_ids, relation_ids) = relation.map_or_else(
        || (vec![object.id.clone()], vec![]),
        |r| (vec![r.to_id.clone(), r.from_id.clone()], vec![r.id.clone()]),
    );
    seeds.entry(cause.into()).or_default().push(Start {
        object_id: object.id.clone(),
        object_ids,
        relation_ids,
        rule_id: rule.into(),
    });
}

#[allow(clippy::too_many_lines)]
fn diff(
    baseline: &WorldSnapshot,
    target: &WorldSnapshot,
) -> Result<(Vec<ImpactChange>, Seeds, Seeds), CoreError> {
    let mut changes = Vec::new();
    let mut left = Seeds::new();
    let mut right = Seeds::new();
    let a: BTreeMap<_, _> = baseline
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    let b: BTreeMap<_, _> = target.objects.iter().map(|o| (o.id.as_str(), o)).collect();
    for id in a.keys().chain(b.keys()).copied().collect::<BTreeSet<_>>() {
        let (before, after) = (a.get(id).copied(), b.get(id).copied());
        let fields = match (before, after) {
            (Some(x), Some(y)) => changed_fields(x, y)?,
            _ => vec!["existence".into()],
        };
        if fields.is_empty() {
            continue;
        }
        let object = after.or(before).expect("union identity");
        changes.push(ImpactChange {
            id: id.into(),
            entity_kind: ImpactEntityKind::Object,
            change_kind: change_kind(before.is_some(), after.is_some()),
            title: object.title.clone(),
            thing_id: object.thing_id.clone(),
            changed_fields: fields,
        });
        if let Some(o) = before {
            add_start(&mut left, id, o, None, "assistant-impact.direct-change");
        }
        if let Some(o) = after {
            add_start(&mut right, id, o, None, "assistant-impact.direct-change");
        }
    }
    let at: BTreeMap<_, _> = baseline.things.iter().map(|t| (t.id.as_str(), t)).collect();
    let bt: BTreeMap<_, _> = target.things.iter().map(|t| (t.id.as_str(), t)).collect();
    for id in at.keys().chain(bt.keys()).copied().collect::<BTreeSet<_>>() {
        let (before, after) = (at.get(id).copied(), bt.get(id).copied());
        let fields = match (before, after) {
            (Some(x), Some(y)) => changed_fields(x, y)?,
            _ => vec!["existence".into()],
        };
        if fields.is_empty() {
            continue;
        }
        let thing = after.or(before).expect("union identity");
        changes.push(ImpactChange {
            id: id.into(),
            entity_kind: ImpactEntityKind::Thing,
            change_kind: change_kind(before.is_some(), after.is_some()),
            title: thing.title.clone(),
            thing_id: Some(id.into()),
            changed_fields: fields,
        });
        for (snapshot, seeds) in [(baseline, &mut left), (target, &mut right)] {
            let owner = snapshot.things.iter().find(|t| t.id == id);
            if owner.is_some_and(|t| factual(&t.source)) {
                for o in snapshot
                    .objects
                    .iter()
                    .filter(|o| o.thing_id.as_deref() == Some(id))
                {
                    add_start(seeds, id, o, None, "assistant-impact.thing-change");
                }
            }
        }
    }
    let ar: BTreeMap<_, _> = baseline
        .relations
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect();
    let br: BTreeMap<_, _> = target
        .relations
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect();
    for id in ar.keys().chain(br.keys()).copied().collect::<BTreeSet<_>>() {
        let (before, after) = (ar.get(id).copied(), br.get(id).copied());
        let fields = match (before, after) {
            (Some(x), Some(y)) => changed_fields(x, y)?,
            _ => vec!["existence".into()],
        };
        if fields.is_empty() {
            continue;
        }
        let relation = after.or(before).expect("union identity");
        changes.push(ImpactChange {
            id: id.into(),
            entity_kind: ImpactEntityKind::Relation,
            change_kind: change_kind(before.is_some(), after.is_some()),
            title: format!(
                "{}: {} → {}",
                relation.kind, relation.from_id, relation.to_id
            ),
            thing_id: None,
            changed_fields: fields,
        });
        for (relation, objects, seeds) in [(before, &a, &mut left), (after, &b, &mut right)] {
            if let Some(r) = relation.filter(|r| eligible_rule(r, objects).is_some())
                && let Some(o) = objects.get(r.from_id.as_str())
            {
                add_start(seeds, id, o, Some(r), "assistant-impact.relation-change");
            }
        }
    }
    let context_fields = changed_fields(
        &ContextContent::from(baseline),
        &ContextContent::from(target),
    )?;
    if !context_fields.is_empty() {
        changes.push(ImpactChange {
            id: "world-context".into(),
            entity_kind: ImpactEntityKind::Context,
            change_kind: ImpactChangeKind::Modified,
            title: target.title.clone(),
            thing_id: None,
            changed_fields: context_fields,
        });
    }
    changes.sort_by(|x, y| x.id.cmp(&y.id));
    Ok((changes, left, right))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextContent<'a> {
    title: &'a str,
    purpose: &'a Purpose,
    environment: &'a Environment,
    phase: &'a str,
    state_kind: &'a StateKind,
    completeness: &'a [CompletenessDeclaration],
    theory: &'a Theory,
    moves: &'a [MoveSummary],
    rule_packs: &'a [RulePackPin],
    active_constraints: &'a [String],
}
impl<'a> From<&'a WorldSnapshot> for ContextContent<'a> {
    fn from(s: &'a WorldSnapshot) -> Self {
        Self {
            title: &s.title,
            purpose: &s.purpose,
            environment: &s.environment,
            phase: &s.phase,
            state_kind: &s.state_kind,
            completeness: &s.completeness,
            theory: &s.theory,
            moves: &s.moves,
            rule_packs: &s.rule_packs,
            active_constraints: &s.active_constraints,
        }
    }
}
fn change_kind(before: bool, after: bool) -> ImpactChangeKind {
    match (before, after) {
        (false, true) => ImpactChangeKind::Added,
        (true, false) => ImpactChangeKind::Removed,
        _ => ImpactChangeKind::Modified,
    }
}
fn functional_kind(kind: &str) -> bool {
    matches!(
        kind,
        "task"
            | "planItem"
            | "completionObservation"
            | "metric"
            | "metricDefinition"
            | "interface"
            | "service"
            | "adapter"
            | "store"
            | "operation"
            | "calendarBlock"
            | "goal"
            | "outcome"
            | "indicator"
            | "capability"
    )
}
fn eligible_rule(
    relation: &ModelRelation,
    objects: &BTreeMap<&str, &ModelObject>,
) -> Option<&'static str> {
    let from = objects.get(relation.from_id.as_str())?;
    let to = objects.get(relation.to_id.as_str())?;
    if !factual(&relation.source) || !factual(&from.source) || !factual(&to.source) {
        return None;
    }
    match relation.kind.as_str() {
        "dependsOn" if functional_kind(&from.kind) && functional_kind(&to.kind) => {
            Some("assistant-impact.depends-on")
        }
        "covers" if from.kind == "assay" && functional_kind(&to.kind) => {
            Some("assistant-impact.assay-coverage")
        }
        "verifiedBy" if from.kind == "acceptanceCriterion" && to.kind == "assay" => {
            Some("assistant-impact.criterion-coverage")
        }
        _ => None,
    }
}

#[derive(Clone)]
struct Edge {
    to: usize,
    relation_id: String,
    rule_id: &'static str,
}
struct Closure {
    objects: BTreeMap<String, AffectedObject>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedWitness<'a> {
    seed_id: &'a str,
    side: &'a ImpactSide,
    rule_id: &'a str,
    object_ids: &'a [&'a str],
    relation_ids: &'a [&'a str],
}
#[allow(clippy::too_many_lines)]
fn closure(
    snapshot: &WorldSnapshot,
    seeds: &Seeds,
    side: &ImpactSide,
    diagnostics: &mut Vec<ImpactDiagnostic>,
    pair_budget: &mut usize,
    ref_budget: &mut usize,
    byte_budget: &mut usize,
) -> Result<Closure, CoreError> {
    let objects: BTreeMap<_, _> = snapshot
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    let ordered: Vec<_> = objects.values().copied().collect();
    let indices: BTreeMap<_, _> = ordered
        .iter()
        .enumerate()
        .map(|(i, o)| (o.id.as_str(), i))
        .collect();
    let mut adjacency = vec![Vec::<Edge>::new(); ordered.len()];
    let mut edge_count = 0;
    for relation in &snapshot.relations {
        if let Some(rule) = eligible_rule(relation, &objects) {
            let from = indices[relation.to_id.as_str()];
            let to = indices[relation.from_id.as_str()];
            adjacency[from].push(Edge {
                to,
                relation_id: relation.id.clone(),
                rule_id: rule,
            });
            edge_count += 1;
        } else if matches!(
            relation.kind.as_str(),
            "dependsOn" | "covers" | "verifiedBy"
        ) {
            diagnostics.push(diagnostic(
                if !factual(&relation.source)
                    || !factual(&objects[relation.from_id.as_str()].source)
                    || !factual(&objects[relation.to_id.as_str()].source)
                {
                    "non_factual_input"
                } else {
                    "unsupported_coverage_endpoints"
                },
                format!(
                    "Relation {} is excluded from established impact facts",
                    relation.id
                ),
                None,
                side.clone(),
                vec![relation.from_id.clone(), relation.to_id.clone()],
            ));
        }
    }
    for object in &snapshot.objects {
        if !factual(&object.source) {
            diagnostics.push(diagnostic(
                "non_factual_input",
                format!(
                    "Object {} is excluded from established impact facts",
                    object.id
                ),
                None,
                side.clone(),
                vec![object.id.clone()],
            ));
        }
    }
    let work = seeds
        .len()
        .checked_mul(ordered.len() + edge_count)
        .ok_or_else(|| limited("impact work estimate overflow"))?;
    if work > MAX_IMPACT_WORK_UNITS {
        return Err(limited("impact traversal exceeds work limit"));
    }
    for edges in &mut adjacency {
        edges.sort_by(|a, b| {
            ordered[a.to]
                .id
                .cmp(&ordered[b.to].id)
                .then_with(|| a.relation_id.cmp(&b.relation_id))
        });
    }
    let mut program = ImpactProgram::default();
    for (from, edges) in adjacency.iter().enumerate() {
        for edge in edges {
            program.edge.push((from, edge.to));
        }
    }
    let mut result: BTreeMap<String, AffectedObject> = BTreeMap::new();
    let mut pairs = 0;

    // A bounded shortest-path traversal preflights materialization and constructs exact witnesses.
    // The Ascent fixed point below determines the recursive set independently.
    for (seed_index, (seed_id, starts)) in seeds.iter().enumerate() {
        let mut starts = starts.clone();
        starts.sort_by(|a, b| {
            a.relation_ids
                .len()
                .cmp(&b.relation_ids.len())
                .then_with(|| a.object_ids.cmp(&b.object_ids))
                .then_with(|| a.relation_ids.cmp(&b.relation_ids))
        });
        let mut seen = BTreeSet::new();
        let mut queue = VecDeque::new();
        for start in &starts {
            let index = indices[start.object_id.as_str()];
            program.seed.push((seed_index, index));
            if seen.insert(index) {
                queue.push_back((
                    index,
                    start
                        .object_ids
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>(),
                    start
                        .relation_ids
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>(),
                    start.rule_id.as_str(),
                    true,
                ));
            }
        }
        while let Some((current, object_ids, relation_ids, rule_id, direct)) = queue.pop_front() {
            *pair_budget = pair_budget
                .checked_sub(1)
                .ok_or_else(|| limited("impact derived pairs exceed limit"))?;
            let object = ordered[current];
            let copies = if matches!(object.kind.as_str(), "assay" | "acceptanceCriterion") {
                2
            } else {
                1
            };
            let count = (object_ids.len() + relation_ids.len()) * copies;
            *ref_budget = ref_budget
                .checked_sub(count)
                .ok_or_else(|| limited("impact witness references exceed limit"))?;
            pairs += 1;

            let object = ordered[current];
            let borrowed = BorrowedWitness {
                seed_id,
                side,
                rule_id,
                object_ids: &object_ids,
                relation_ids: &relation_ids,
            };
            let bytes =
                bounded_json(&borrowed, *byte_budget / copies, "impact witness bytes")? * copies;
            *byte_budget -= bytes;
            let witness = ImpactWitness {
                seed_id: seed_id.clone(),
                side: side.clone(),
                rule_id: rule_id.into(),
                object_ids: object_ids.iter().map(|id| (*id).to_owned()).collect(),
                relation_ids: relation_ids.iter().map(|id| (*id).to_owned()).collect(),
            };
            let affected = result
                .entry(object.id.clone())
                .or_insert_with(|| AffectedObject {
                    object_id: object.id.clone(),
                    title: object.title.clone(),
                    kind: object.kind.clone(),
                    side: side.clone(),
                    direct: false,
                    witnesses: vec![],
                });
            affected.direct |= direct;
            affected.witnesses.push(witness);
            for edge in &adjacency[current] {
                if seen.insert(edge.to) {
                    let mut nodes = object_ids.clone();
                    nodes.push(ordered[edge.to].id.as_str());
                    let mut relations = relation_ids.clone();
                    relations.push(edge.relation_id.as_str());
                    queue.push_back((edge.to, nodes, relations, edge.rule_id, false));
                }
            }
        }
    }
    program.run();
    if program.affected.len() != pairs {
        return Err(invalid("impact fixed-point and witness set disagree"));
    }
    Ok(Closure { objects: result })
}

struct ImpactProjections {
    affected_things: Vec<ThingImpact>,
    assays: Vec<AffectedObject>,
    criteria: Vec<CriterionImpact>,
}
fn merge_affected(before: &mut AffectedObject, after: &AffectedObject) {
    before.side = ImpactSide::Both;
    before.title.clone_from(&after.title);
    before.kind.clone_from(&after.kind);
    before.direct |= after.direct;
    before.witnesses.extend(after.witnesses.iter().cloned());
}
// Classify and group each immutable side before combining identities. Retyping or
// moving an object cannot erase its historical Assay, criterion, or Thing owner.
fn project_impact_sides(
    baseline: &WorldSnapshot,
    target: &WorldSnapshot,
    left: &Closure,
    right: &Closure,
) -> Result<ImpactProjections, CoreError> {
    let mut groups: BTreeMap<Option<String>, BTreeMap<String, AffectedObject>> = BTreeMap::new();
    let mut assays: BTreeMap<String, AffectedObject> = BTreeMap::new();
    let mut criteria: BTreeMap<String, CriterionImpact> = BTreeMap::new();
    for (snapshot, closure) in [(baseline, left), (target, right)] {
        let models: BTreeMap<_, _> = snapshot
            .objects
            .iter()
            .map(|o| (o.id.as_str(), o))
            .collect();
        for object in closure.objects.values() {
            let model = models
                .get(object.object_id.as_str())
                .ok_or_else(|| invalid("affected object did not resolve"))?;
            groups
                .entry(model.thing_id.clone())
                .or_default()
                .entry(object.object_id.clone())
                .and_modify(|before| merge_affected(before, object))
                .or_insert_with(|| object.clone());
            if model.kind == "assay" {
                assays
                    .entry(object.object_id.clone())
                    .and_modify(|before| merge_affected(before, object))
                    .or_insert_with(|| object.clone());
            }
            if model.kind == "acceptanceCriterion" {
                let assay_ids: Vec<_> = snapshot
                    .relations
                    .iter()
                    .filter(|r| {
                        r.kind == "verifiedBy"
                            && r.from_id == object.object_id
                            && eligible_rule(r, &models).is_some()
                    })
                    .map(|r| r.to_id.clone())
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect();
                criteria
                    .entry(object.object_id.clone())
                    .and_modify(|before| {
                        before.side = ImpactSide::Both;
                        before.witnesses.extend(object.witnesses.iter().cloned());
                        before.assay_ids.extend(assay_ids.iter().cloned());
                        before.assay_ids.sort();
                        before.assay_ids.dedup();
                    })
                    .or_insert_with(|| CriterionImpact {
                        criterion_id: object.object_id.clone(),
                        assay_ids,
                        side: object.side.clone(),
                        witnesses: object.witnesses.clone(),
                    });
            }
        }
    }
    let affected_things = groups
        .into_iter()
        .map(|(thing_id, objects)| {
            let models = if objects.values().all(|o| o.side == ImpactSide::Baseline) {
                [baseline, target]
            } else {
                [target, baseline]
            };
            let title = thing_id
                .as_ref()
                .and_then(|id| models.iter().flat_map(|s| &s.things).find(|t| &t.id == id))
                .map_or_else(|| "World objects".into(), |t| t.title.clone());
            ThingImpact {
                thing_id,
                title,
                objects: objects.into_values().collect(),
            }
        })
        .collect();
    Ok(ImpactProjections {
        affected_things,
        assays: assays.into_values().collect(),
        criteria: criteria.into_values().collect(),
    })
}

/// Computes advisory potential consequences from actual immutable snapshot content.
/// # Errors
/// Rejects incompatible Worlds/schemas, missing compiled pins and bounded resource overflow.
#[allow(clippy::too_many_lines)]
pub fn evaluate_change_impact(
    baseline: &WorldSnapshot,
    target: &WorldSnapshot,
    context: &ImpactAnalysisContext,
) -> Result<ChangeImpactReport, CoreError> {
    validate_snapshot(baseline)?;
    validate_snapshot(target)?;
    if context.evidence_bindings.len() > MAX_IMPACT_EVIDENCE_BINDINGS {
        return Err(limited("evidence binding count exceeds limit"));
    }
    bounded_json(context, MAX_REQUEST_BYTES, "impact context")?;
    if baseline.world_id != target.world_id
        || content_hash(&baseline.template)? != content_hash(&target.template)?
        || content_hash(&baseline.thing_templates)? != content_hash(&target.thing_templates)?
    {
        return Err(invalid(
            "impact snapshots require the same World and schema",
        ));
    }
    let baseline_hash = content_hash(baseline)?;
    let target_hash = content_hash(target)?;
    let mut diagnostics = Vec::new();
    let mut complete = true;
    for (snapshot, side) in [
        (baseline, ImpactSide::Baseline),
        (target, ImpactSide::Proposed),
    ] {
        for scope in [
            IMPACT_DEPENDENCY_SCOPE,
            IMPACT_CRITERION_SCOPE,
            IMPACT_METRIC_SCOPE,
        ] {
            if !complete_scope(snapshot, scope) {
                complete = false;
                diagnostics.push(diagnostic("incomplete_scope","Known impacts are reported; missing facts prevent absence and evidence-reuse conclusions",Some(scope),side.clone(),vec![]));
            }
        }
    }
    if baseline.revision_id == target.revision_id && baseline_hash != target_hash {
        diagnostics.push(diagnostic("revision_content_mismatch","The same revision label carries different snapshot content; actual input hashes control this advisory comparison",None,ImpactSide::Both,vec![]));
    }
    let (changes, left_seeds, right_seeds) = diff(baseline, target)?;
    // Bound combined work before constructing either closure.
    let work_for = |s: &WorldSnapshot, seeds: &Seeds| -> Result<usize, CoreError> {
        let map: BTreeMap<_, _> = s.objects.iter().map(|o| (o.id.as_str(), o)).collect();
        seeds
            .len()
            .checked_add(context.evidence_bindings.len())
            .and_then(|count| {
                count.checked_mul(
                    s.objects.len()
                        + s.relations
                            .iter()
                            .filter(|r| eligible_rule(r, &map).is_some())
                            .count(),
                )
            })
            .ok_or_else(|| limited("impact work estimate overflow"))
    };
    if work_for(baseline, &left_seeds)?
        .checked_add(work_for(target, &right_seeds)?)
        .is_none_or(|work| work > MAX_IMPACT_WORK_UNITS)
    {
        return Err(limited("combined impact traversal exceeds work limit"));
    }
    let mut pair_budget = MAX_IMPACT_DERIVED_PAIRS;
    let mut ref_budget = MAX_IMPACT_WITNESS_REFS;
    let mut byte_budget = MAX_IMPACT_REPORT_BYTES;
    let left = closure(
        baseline,
        &left_seeds,
        &ImpactSide::Baseline,
        &mut diagnostics,
        &mut pair_budget,
        &mut ref_budget,
        &mut byte_budget,
    )?;
    let right = closure(
        target,
        &right_seeds,
        &ImpactSide::Proposed,
        &mut diagnostics,
        &mut pair_budget,
        &mut ref_budget,
        &mut byte_budget,
    )?;
    if diagnostics.iter().any(|d| {
        matches!(
            d.code.as_str(),
            "non_factual_input" | "unsupported_coverage_endpoints"
        ) && !d.object_ids.is_empty()
    }) {
        complete = false;
        diagnostics.push(diagnostic(
            "incomplete_facts",
            "Excluded or unresolved input facts prevent absence and evidence-reuse conclusions",
            None,
            ImpactSide::Both,
            vec![],
        ));
    }
    let evidence = assess_evidence(baseline, target, context, &left, &right, complete)?;
    let ImpactProjections {
        affected_things,
        assays,
        criteria,
    } = project_impact_sides(baseline, target, &left, &right)?;
    diagnostics.sort_by_key(|d| {
        (
            d.code.clone(),
            d.scope_id.clone(),
            d.object_ids.clone(),
            format!("{:?}", d.side),
        )
    });
    diagnostics.dedup();
    let report = ChangeImpactReport {
        baseline: SnapshotIdentity {
            world_id: baseline.world_id.clone(),
            revision_id: baseline.revision_id.clone(),
            snapshot_hash: baseline_hash,
        },
        target: SnapshotIdentity {
            world_id: target.world_id.clone(),
            revision_id: target.revision_id.clone(),
            snapshot_hash: target_hash,
        },
        origin: context.origin.clone(),
        rule_packs: vec![RulePackPin {
            id: ASSISTANT_IMPACT_PACK_ID.into(),
            version: ASSISTANT_IMPACT_PACK_VERSION.into(),
        }],
        changes,
        affected_things,
        criteria,
        assays,
        metrics: crate::assistant_impact::evaluate_metrics(baseline, target)?,
        evidence,
        diagnostics,
        complete,
    };
    bounded_json(&report, MAX_IMPACT_REPORT_BYTES, "impact report")?;
    Ok(report)
}

#[allow(clippy::too_many_lines)]
fn assess_evidence(
    baseline: &WorldSnapshot,
    target: &WorldSnapshot,
    context: &ImpactAnalysisContext,
    left: &Closure,
    right: &Closure,
    complete: bool,
) -> Result<Vec<EvidenceImpact>, CoreError> {
    let before: BTreeMap<_, _> = baseline
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    let after: BTreeMap<_, _> = target.objects.iter().map(|o| (o.id.as_str(), o)).collect();
    let before_relations: BTreeMap<_, _> = baseline
        .relations
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect();
    let after_relations: BTreeMap<_, _> = target
        .relations
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect();
    let upstream = |snapshot: &WorldSnapshot| {
        let objects: BTreeMap<_, _> = snapshot
            .objects
            .iter()
            .map(|o| (o.id.as_str(), o))
            .collect();
        let mut edges: BTreeMap<String, Vec<ModelRelation>> = BTreeMap::new();
        for relation in &snapshot.relations {
            if eligible_rule(relation, &objects).is_some() {
                edges
                    .entry(relation.from_id.clone())
                    .or_default()
                    .push(relation.clone());
            }
        }
        edges
    };
    let before_edges = upstream(baseline);
    let after_edges = upstream(target);
    let mut evidence = BTreeMap::new();
    for binding in &context.evidence_bindings {
        if binding.evidence_id.is_empty() || evidence.contains_key(&binding.evidence_id) {
            return Err(invalid("empty or duplicate evidence binding identity"));
        }
        let mut reasons = BTreeSet::new();
        let mut unknown = false;
        let mut recheck = false;
        if !complete {
            unknown = true;
            reasons.insert("incomplete impact scopes prevent a reuse conclusion".into());
        }
        let assay = after.get(binding.assay_id.as_str()).copied();
        if let Some(assay) = assay.filter(|a| a.kind == "assay" && factual(&a.source)) {
            if let Some(hash) = &binding.assay_definition_hash {
                if &content_hash(assay)? != hash {
                    recheck = true;
                    reasons.insert("Assay definition differs from the captured definition".into());
                }
            } else {
                unknown = true;
                reasons.insert("missing Assay definition binding".into());
            }
        } else {
            unknown = true;
            reasons.insert("missing or non-factual Assay reference".into());
        }
        if binding.object_inputs.is_empty() {
            unknown = true;
            reasons.insert("missing captured object inputs".into());
        }
        let mut bound_objects = BTreeSet::new();
        for input in &binding.object_inputs {
            if !bound_objects.insert(input.object_id.as_str()) {
                return Err(invalid("duplicate evidence object input"));
            }
            match after.get(input.object_id.as_str()) {
                Some(object) if factual(&object.source) => {
                    if content_hash(*object)? != input.digest {
                        recheck = true;
                        reasons.insert(format!("captured input {} changed", input.object_id));
                    }
                    if left.objects.contains_key(&input.object_id)
                        || right.objects.contains_key(&input.object_id)
                    {
                        recheck = true;
                        reasons.insert(format!(
                            "captured input {} has a potential dependency effect",
                            input.object_id
                        ));
                    }
                }
                _ => {
                    unknown = true;
                    reasons.insert(format!(
                        "captured input {} is missing or non-factual",
                        input.object_id
                    ));
                }
            }
            // A removal is a known change only when the captured baseline input resolves.
            if !after.contains_key(input.object_id.as_str())
                && before
                    .get(input.object_id.as_str())
                    .is_some_and(|o| content_hash(*o).is_ok_and(|h| h == input.digest))
            {
                recheck = true;
                reasons.insert(format!("captured input {} was removed", input.object_id));
            }
        }
        let mut bound_relations = BTreeSet::new();
        for input in &binding.relation_inputs {
            if !bound_relations.insert(input.relation_id.as_str()) {
                return Err(invalid("duplicate evidence relation input"));
            }
            match after_relations.get(input.relation_id.as_str()) {
                Some(relation) if factual(&relation.source) => {
                    if content_hash(*relation)? != input.digest {
                        recheck = true;
                        reasons.insert(format!("captured relation {} changed", input.relation_id));
                    }
                }
                _ => {
                    unknown = true;
                    reasons.insert(format!(
                        "captured relation {} is missing or non-factual",
                        input.relation_id
                    ));
                    if before_relations
                        .get(input.relation_id.as_str())
                        .is_some_and(|r| content_hash(*r).is_ok_and(|h| h == input.digest))
                    {
                        recheck = true;
                    }
                }
            }
        }
        let mut bound_things = BTreeSet::new();
        for pin in &binding.thing_revisions {
            if !bound_things.insert(pin.thing_id.as_str()) {
                return Err(invalid("duplicate evidence Thing revision"));
            }
            match target.things.iter().find(|t| t.id == pin.thing_id) {
                Some(thing) if factual(&thing.source) => {
                    if thing.revision_id != pin.revision_id {
                        recheck = true;
                        reasons.insert(format!("Thing {} revision changed", pin.thing_id));
                    }
                }
                _ => {
                    unknown = true;
                    reasons.insert(format!("Thing {} reference is missing", pin.thing_id));
                }
            }
        }
        if let Some(assay) = assay {
            let owner_bound = if let Some(owner) = assay.thing_id.as_deref() {
                if bound_things.contains(owner) {
                    true
                } else {
                    unknown = true;
                    reasons.insert(format!(
                        "missing Assay owner Thing revision binding for {owner}"
                    ));
                    false
                }
            } else {
                true
            };
            if owner_bound
                && (left.objects.contains_key(&binding.assay_id)
                    || right.objects.contains_key(&binding.assay_id))
            {
                recheck = true;
                reasons.insert("Assay has a potential dependency or owner revision effect".into());
            }
        }
        for input in &binding.object_inputs {
            if let Some(thing_id) = after
                .get(input.object_id.as_str())
                .and_then(|o| o.thing_id.as_deref())
                && !bound_things.contains(thing_id)
            {
                unknown = true;
                reasons.insert(format!("missing Thing revision binding for {thing_id}"));
            }
        }
        if binding.rule_packs.is_empty() {
            unknown = true;
            reasons.insert("missing compiled rule pack bindings".into());
        } else if content_hash(&binding.rule_packs)? != content_hash(&target.rule_packs)? {
            recheck = true;
            reasons.insert("compiled rule pack pins differ from captured pins".into());
        }
        // Captures must cover the entire relevant upstream closure and its exact edges.
        for edges in [&before_edges, &after_edges] {
            let mut queue = VecDeque::from([binding.assay_id.as_str()]);
            let mut seen = BTreeSet::new();
            while let Some(id) = queue.pop_front() {
                if !seen.insert(id) {
                    continue;
                }
                for relation in edges.get(id).into_iter().flatten() {
                    {
                        if !bound_relations.contains(relation.id.as_str()) {
                            unknown = true;
                            reasons.insert(format!(
                                "missing closure relation binding for {}",
                                relation.id
                            ));
                        }
                        if !bound_objects.contains(relation.to_id.as_str()) {
                            unknown = true;
                            reasons.insert(format!(
                                "missing closure object binding for {}",
                                relation.to_id
                            ));
                        }
                        queue.push_back(relation.to_id.as_str());
                    }
                }
            }
        }
        let applicability = if recheck {
            EvidenceApplicability::NeedsRecheck
        } else if unknown {
            EvidenceApplicability::Unknown
        } else {
            EvidenceApplicability::InputsMatch
        };
        if applicability == EvidenceApplicability::InputsMatch {
            reasons.insert("captured inputs, Thing revisions, Assay definition, dependency closure and rule pins match".into());
        }
        evidence.insert(
            binding.evidence_id.clone(),
            EvidenceImpact {
                evidence_id: binding.evidence_id.clone(),
                assay_id: binding.assay_id.clone(),
                applicability,
                provenance: binding.provenance.clone(),
                reasons: reasons.into_iter().collect(),
                object_ids: bound_objects.into_iter().map(str::to_owned).collect(),
            },
        );
    }
    for object in before
        .values()
        .chain(after.values())
        .filter(|o| matches!(o.kind.as_str(), "evidence" | "verificationEvidence"))
    {
        evidence
            .entry(object.id.clone())
            .or_insert_with(|| EvidenceImpact {
                evidence_id: object.id.clone(),
                assay_id: object
                    .properties
                    .get("assayId")
                    .cloned()
                    .unwrap_or_default(),
                applicability: EvidenceApplicability::Unknown,
                provenance: EvidenceProvenance::Unverified,
                reasons: vec![
                    "source-only historical evidence has no captured input bindings".into(),
                ],
                object_ids: vec![],
            });
    }
    Ok(evidence.into_values().collect())
}

fn property_key(property: &ImpactProperty) -> &'static str {
    match property {
        ImpactProperty::Status => "status",
        ImpactProperty::PlannedAt => "plannedAt",
        ImpactProperty::CompletedAt => "completedAt",
        ImpactProperty::TaskId => "taskId",
        ImpactProperty::MetricDefinition => "metricDefinition",
        ImpactProperty::WindowStart => "windowStart",
        ImpactProperty::WindowEnd => "windowEnd",
        ImpactProperty::Statement => "statement",
        ImpactProperty::DefinitionHash => "definitionHash",
    }
}
fn metric_definition(value: &str) -> Result<MetricDefinition, CoreError> {
    match value {
        "completedPlannedTasks" => Ok(MetricDefinition::CompletedPlannedTasks),
        "completedPlannedTasksIncludingCancelled" => {
            Ok(MetricDefinition::CompletedPlannedTasksIncludingCancelled)
        }
        _ => Err(invalid("unsupported metric definition")),
    }
}
fn definition_value(definition: &MetricDefinition) -> &'static str {
    match definition {
        MetricDefinition::CompletedPlannedTasks => "completedPlannedTasks",
        MetricDefinition::CompletedPlannedTasksIncludingCancelled => {
            "completedPlannedTasksIncludingCancelled"
        }
    }
}
fn validate_property(
    object: &ModelObject,
    property: &ImpactProperty,
    value: &str,
) -> Result<(), CoreError> {
    if value.len() > 4096 || value.trim().is_empty() {
        return Err(invalid(
            "patch property must be nonempty and at most 4096 bytes",
        ));
    }
    let allowed = match property {
        ImpactProperty::Status => {
            object.kind == "planItem" && matches!(value, "planned" | "cancelled")
        }
        ImpactProperty::PlannedAt => {
            crate::assistant_impact::validate_utc(value)?;
            object.kind == "planItem"
        }
        ImpactProperty::CompletedAt => {
            crate::assistant_impact::validate_utc(value)?;
            object.kind == "completionObservation"
        }
        ImpactProperty::TaskId => {
            matches!(object.kind.as_str(), "planItem" | "completionObservation")
        }
        // Definitions must use SetMetricDefinition, keeping the protected lineage coherent.
        ImpactProperty::MetricDefinition | ImpactProperty::DefinitionHash => false,
        ImpactProperty::WindowStart | ImpactProperty::WindowEnd => {
            crate::assistant_impact::validate_utc(value)?;
            object.kind == "metric"
        }
        ImpactProperty::Statement => matches!(
            object.kind.as_str(),
            "task"
                | "goal"
                | "outcome"
                | "indicator"
                | "capability"
                | "operation"
                | "interface"
                | "adapter"
                | "service"
                | "store"
                | "calendarBlock"
                | "acceptanceCriterion"
        ),
    };
    if !allowed {
        return Err(invalid(format!(
            "property {} is not an admitted edit for {}",
            property_key(property),
            object.kind
        )));
    }
    Ok(())
}
fn mark_draft(source: &mut Source, draft_id: &str) {
    source.kind = SourceKind::Declared;
    source.reference = format!("hypothetical:{draft_id}");
}
fn require_factual(object: &ModelObject) -> Result<(), CoreError> {
    if factual(&object.source) {
        Ok(())
    } else {
        Err(invalid(
            "hypothetical patches cannot promote non-factual input into established facts",
        ))
    }
}
fn validate_relation_identity(snapshot: &WorldSnapshot, id: &str) -> Result<(), CoreError> {
    if id.is_empty()
        || id.len() > 256
        || snapshot.relations.iter().any(|r| r.id == id)
        || snapshot.objects.iter().any(|o| o.id == id)
        || snapshot.things.iter().any(|t| t.id == id)
    {
        Err(invalid(
            "new relation identity is empty, oversized, or already exists",
        ))
    } else {
        Ok(())
    }
}
fn endpoint<'a>(snapshot: &'a WorldSnapshot, id: &str) -> Result<&'a ModelObject, CoreError> {
    snapshot
        .objects
        .iter()
        .find(|o| o.id == id)
        .ok_or_else(|| invalid(format!("patch endpoint {id} does not resolve")))
}

/// Applies only the compiled typed draft operations; saved identity/authority is never reused.
/// # Errors
/// Rejects invalid draft identity, operations, endpoints, property values and resource overflow.
#[allow(clippy::too_many_lines)]
pub fn apply_impact_patch(
    baseline: &WorldSnapshot,
    patch: &ImpactPatch,
    draft_revision_id: &str,
) -> Result<WorldSnapshot, CoreError> {
    validate_snapshot(baseline)?;
    if !draft_revision_id.starts_with("draft:")
        || draft_revision_id.len() <= 6
        || draft_revision_id.len() > 256
        || draft_revision_id == baseline.revision_id
        || draft_revision_id.chars().any(char::is_whitespace)
    {
        return Err(invalid(
            "hypothetical revision requires a distinct nonempty draft: identity",
        ));
    }
    if patch.operations.len() > MAX_IMPACT_PATCH_OPERATIONS {
        return Err(limited("impact patch operations exceed limit"));
    }
    bounded_json(patch, MAX_REQUEST_BYTES, "impact patch")?;
    let mut draft = baseline.clone();
    draft.revision_id = draft_revision_id.into();
    draft.state_kind = StateKind::Candidate;
    for operation in &patch.operations {
        match operation {
            ImpactPatchOperation::SetThingRevision {
                thing_id,
                revision_id,
            } => {
                if revision_id.trim().is_empty() || revision_id.len() > 256 {
                    return Err(invalid("Thing revision must be nonempty and bounded"));
                }
                let thing = draft
                    .things
                    .iter_mut()
                    .find(|t| &t.id == thing_id)
                    .ok_or_else(|| invalid("Thing patch target does not resolve"))?;
                if !factual(&thing.source) {
                    return Err(invalid("patch cannot establish a non-factual Thing"));
                }
                thing.revision_id.clone_from(revision_id);
                mark_draft(&mut thing.source, draft_revision_id);
            }
            ImpactPatchOperation::SetProperty {
                object_id,
                property,
                value,
            } => {
                let object = draft
                    .objects
                    .iter_mut()
                    .find(|o| &o.id == object_id)
                    .ok_or_else(|| invalid("property patch target does not resolve"))?;
                require_factual(object)?;
                validate_property(object, property, value)?;
                object
                    .properties
                    .insert(property_key(property).into(), value.clone());
                mark_draft(&mut object.source, draft_revision_id);
            }
            ImpactPatchOperation::AddDependency {
                relation_id,
                dependent_id,
                dependency_id,
            } => {
                validate_relation_identity(&draft, relation_id)?;
                let dependent = endpoint(&draft, dependent_id)?;
                let dependency = endpoint(&draft, dependency_id)?;
                require_factual(dependent)?;
                require_factual(dependency)?;
                if !functional_kind(&dependent.kind) || !functional_kind(&dependency.kind) {
                    return Err(invalid("dependency patch requires functional endpoints"));
                }
                draft.relations.push(ModelRelation {
                    id: relation_id.clone(),
                    kind: "dependsOn".into(),
                    from_id: dependent_id.clone(),
                    to_id: dependency_id.clone(),
                    source: Source {
                        kind: SourceKind::Declared,
                        reference: format!("hypothetical:{draft_revision_id}"),
                    },
                });
            }
            ImpactPatchOperation::RemoveDependency { relation_id } => {
                let index = draft
                    .relations
                    .iter()
                    .position(|r| {
                        &r.id == relation_id && r.kind == "dependsOn" && factual(&r.source)
                    })
                    .ok_or_else(|| {
                        invalid("dependency removal must resolve an established dependsOn edge")
                    })?;
                draft.relations.remove(index);
            }
            ImpactPatchOperation::SetCriterionAssay {
                relation_id,
                criterion_id,
                assay_id,
                linked,
            } => {
                let criterion = endpoint(&draft, criterion_id)?;
                let assay = endpoint(&draft, assay_id)?;
                require_factual(criterion)?;
                require_factual(assay)?;
                if criterion.kind != "acceptanceCriterion" || assay.kind != "assay" {
                    return Err(invalid("criterion/Assay patch requires typed endpoints"));
                }
                if *linked {
                    validate_relation_identity(&draft, relation_id)?;
                    draft.relations.push(ModelRelation {
                        id: relation_id.clone(),
                        kind: "verifiedBy".into(),
                        from_id: criterion_id.clone(),
                        to_id: assay_id.clone(),
                        source: Source {
                            kind: SourceKind::Declared,
                            reference: format!("hypothetical:{draft_revision_id}"),
                        },
                    });
                } else {
                    let index = draft
                        .relations
                        .iter()
                        .position(|r| {
                            &r.id == relation_id
                                && r.kind == "verifiedBy"
                                && &r.from_id == criterion_id
                                && &r.to_id == assay_id
                                && factual(&r.source)
                        })
                        .ok_or_else(|| {
                            invalid("criterion/Assay removal must match exact established relation")
                        })?;
                    draft.relations.remove(index);
                }
            }
            ImpactPatchOperation::SetMetricDefinition {
                metric_id,
                definition,
            } => {
                let metric = endpoint(&draft, metric_id)?;
                require_factual(metric)?;
                if metric.kind != "metric" {
                    return Err(invalid("metric definition target must be a metric"));
                }
                let definitions: Vec<_> = draft
                    .relations
                    .iter()
                    .filter(|r| {
                        r.kind == "dependsOn" && &r.from_id == metric_id && factual(&r.source)
                    })
                    .filter_map(|r| {
                        draft
                            .objects
                            .iter()
                            .find(|o| o.id == r.to_id && o.kind == "metricDefinition")
                    })
                    .collect();
                if definitions.len() != 1 {
                    return Err(invalid(
                        "metric must have exactly one established definition lineage",
                    ));
                }
                require_factual(definitions[0])?;
                let definition_id = definitions[0].id.clone();
                let hash = crate::assistant_impact::metric_definition_hash(definition)?;
                for object in draft
                    .objects
                    .iter_mut()
                    .filter(|o| &o.id == metric_id || o.id == definition_id)
                {
                    object.properties.insert(
                        "metricDefinition".into(),
                        definition_value(definition).into(),
                    );
                    object.properties.insert("unit".into(), "ratio".into());
                    if &object.id == metric_id {
                        object
                            .properties
                            .insert("definitionHash".into(), hash.clone());
                    }
                    mark_draft(&mut object.source, draft_revision_id);
                }
            }
        }
    }
    for object in &draft.objects {
        if object.kind == "metric" {
            if let (Some(start), Some(end)) = (
                object.properties.get("windowStart"),
                object.properties.get("windowEnd"),
            ) {
                crate::assistant_impact::validate_utc(start)?;
                crate::assistant_impact::validate_utc(end)?;
                if start >= end {
                    return Err(invalid(
                        "metric reporting window must have start before end",
                    ));
                }
            }
            if let Some(value) = object.properties.get("metricDefinition") {
                metric_definition(value)?;
            }
        }
    }
    validate_snapshot(&draft)?;
    Ok(draft)
}
