use ascent::ascent;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use ts_rs::TS;

pub const MAX_OBJECTS: usize = 1_000;
pub const MAX_RELATIONS: usize = 5_000;
pub const MAX_DERIVED_FACTS: usize = 20_000;
pub const MAX_REQUEST_BYTES: usize = 1_048_576;
pub const MAX_THINGS: usize = 256;
pub const MAX_THING_TEMPLATES: usize = 256;
pub const MAX_TEMPLATE_SHAPES: usize = 256;
pub const MAX_RELATION_ENDPOINTS: usize = 1_024;
pub const MAX_REQUIRED_RELATIONS: usize = 512;
pub const MAX_FORBIDDEN_CYCLE_RULES: usize = 32;
pub const MAX_CONSTRAINT_RULES: usize = 512;
pub const MAX_RULE_PACKS: usize = 128;
pub const MAX_COMPLETENESS_DECLARATIONS: usize = 512;
pub const MAX_THEORY_CLAIMS: usize = 512;
pub const MAX_MOVES: usize = 256;
pub const EVALUATOR_VERSION: &str = "bropilot-readiness@1";

macro_rules! wire_type {
    ($(#[$meta:meta])* $vis:vis struct $name:ident $body:tt) => {
        $(#[$meta])*
        #[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
        #[serde(rename_all = "camelCase")]
        $vis struct $name $body
    };
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum SourceKind {
    Declared,
    Assumption,
    Hypothesis,
    Observation,
    Proposal,
    Derived,
}

wire_type!(
    pub struct VersionRef {
        pub id: String,
        pub version: String,
    }
);

wire_type!(
    pub struct Source {
        pub kind: SourceKind,
        pub reference: String,
    }
);

wire_type!(
    pub struct ObjectShape {
        pub id: String,
        pub kind: String,
        pub required_properties: Vec<String>,
    }
);

wire_type!(
    pub struct RelationEndpoint {
        pub relation_kind: String,
        pub from_kinds: Vec<String>,
        pub to_kinds: Vec<String>,
    }
);

wire_type!(
    pub struct RequiredRelation {
        pub rule_id: String,
        pub subject_kind: String,
        pub relation_kind: String,
        pub object_kind: String,
        pub scope_id: String,
    }
);

wire_type!(
    pub struct ForbiddenCycle {
        pub rule_id: String,
        pub relation_kinds: Vec<String>,
    }
);

wire_type!(
    pub struct IncompatibleConstraint {
        pub rule_id: String,
        pub left: String,
        pub right: String,
    }
);

wire_type!(
    pub struct WorldTemplate {
        pub id: String,
        pub version: String,
        pub object_shapes: Vec<ObjectShape>,
        pub allowed_relation_endpoints: Vec<RelationEndpoint>,
        pub required_relations: Vec<RequiredRelation>,
        pub forbidden_cycles: Vec<ForbiddenCycle>,
        pub incompatible_constraints: Vec<IncompatibleConstraint>,
        pub required_rule_packs: Vec<RulePackPin>,
    }
);

wire_type!(
    pub struct Purpose {
        pub statement: String,
        pub beneficiary_ids: Vec<String>,
        pub outcome_ids: Vec<String>,
    }
);

wire_type!(
    pub struct Environment {
        pub id: String,
        pub title: String,
    }
);

wire_type!(
    pub struct ThingCapabilities {
        pub external: bool,
        pub forkable: bool,
        pub observable: bool,
        pub reversible: bool,
    }
);

wire_type!(
    pub struct ExternalReference {
        pub system: String,
        pub connection_status: String,
    }
);

wire_type!(
    pub struct ThingTemplate {
        pub id: String,
        pub version: String,
        pub title: String,
        pub compatible_world_templates: Vec<VersionRef>,
        pub inherits_world_context: bool,
        pub capabilities: ThingCapabilities,
    }
);

wire_type!(
    pub struct CompiledRulePack {
        pub id: String,
        pub version: String,
        pub title: String,
        pub required_for_world_template_ids: Vec<String>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum StateKind {
    Desired,
    Canonical,
    Candidate,
    Deployed,
}

wire_type!(
    pub struct Thing {
        pub id: String,
        pub kind: String,
        pub title: String,
        pub revision_id: String,
        pub template_ref: VersionRef,
        pub capabilities: ThingCapabilities,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub external_reference: Option<ExternalReference>,
        pub source: Source,
    }
);

wire_type!(
    pub struct ModelObject {
        pub id: String,
        pub kind: String,
        pub title: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub thing_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub parent_id: Option<String>,
        pub properties: BTreeMap<String, String>,
        pub source: Source,
    }
);

wire_type!(
    pub struct ModelRelation {
        pub id: String,
        pub kind: String,
        pub from_id: String,
        pub to_id: String,
        pub source: Source,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CompletenessStatus {
    Complete,
    Incomplete,
}

wire_type!(
    pub struct CompletenessDeclaration {
        pub scope_id: String,
        pub status: CompletenessStatus,
        pub source: Source,
    }
);

wire_type!(
    pub struct TheoryClaim {
        pub id: String,
        pub title: String,
        pub outcome_id: String,
        pub indicator_ids: Vec<String>,
        pub evaluation_ids: Vec<String>,
        pub source: Source,
    }
);

wire_type!(
    pub struct Theory {
        pub claims: Vec<TheoryClaim>,
    }
);

wire_type!(
    pub struct MoveSummary {
        pub id: String,
        pub title: String,
        pub base_revision_id: String,
        pub status: String,
    }
);

wire_type!(
    pub struct RulePackPin {
        pub id: String,
        pub version: String,
    }
);

wire_type!(
    pub struct WorldSnapshot {
        pub world_id: String,
        pub title: String,
        pub revision_id: String,
        pub template: WorldTemplate,
        pub purpose: Purpose,
        pub environment: Environment,
        pub phase: String,
        pub state_kind: StateKind,
        pub things: Vec<Thing>,
        pub thing_templates: Vec<ThingTemplate>,
        pub objects: Vec<ModelObject>,
        pub relations: Vec<ModelRelation>,
        pub completeness: Vec<CompletenessDeclaration>,
        pub theory: Theory,
        pub moves: Vec<MoveSummary>,
        pub rule_packs: Vec<RulePackPin>,
        pub active_constraints: Vec<String>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum Query {
    Workspace,
    Readiness,
    ChangeImpact {
        baseline: Box<WorldSnapshot>,
        context: ImpactAnalysisContext,
    },
    ApplyImpactPatch {
        patch: ImpactPatch,
        #[serde(rename = "draftRevisionId")]
        #[ts(rename = "draftRevisionId")]
        draft_revision_id: String,
    },
    Children {
        #[serde(rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: String,
    },
}

wire_type!(
    pub struct CoreRequest {
        pub api_version: u32,
        pub snapshot: WorldSnapshot,
        pub query: Query,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ReadinessStatus {
    Ready,
    Blocked,
    Unknown,
}

wire_type!(
    pub struct Finding {
        pub rule_id: String,
        pub severity: String,
        pub message: String,
        pub object_ids: Vec<String>,
        pub fact_ids: Vec<String>,
        pub source: Source,
    }
);

wire_type!(
    pub struct DerivedFact {
        pub id: String,
        pub kind: String,
        pub from_id: String,
        pub to_id: String,
        pub fact_ids: Vec<String>,
        pub source: Source,
    }
);

wire_type!(
    pub struct OutcomeAssessment {
        pub outcome_id: String,
        pub status: String,
        pub message: String,
    }
);

wire_type!(
    pub struct ReadinessEvaluation {
        pub world_id: String,
        pub revision_id: String,
        pub template_id: String,
        pub template_version: String,
        pub snapshot_hash: String,
        pub template_hash: String,
        pub evaluator_version: String,
        pub rule_packs: Vec<RulePackPin>,
        pub status: ReadinessStatus,
        pub findings: Vec<Finding>,
        pub derived_facts: Vec<DerivedFact>,
        pub outcome_assessments: Vec<OutcomeAssessment>,
    }
);

wire_type!(
    pub struct WorkspaceResult {
        pub snapshot: WorldSnapshot,
        pub readiness: ReadinessEvaluation,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum CoreResult {
    ImpactPatched {
        snapshot: Box<WorldSnapshot>,
    },
    ChangeImpact {
        report: ChangeImpactReport,
    },
    Workspace {
        snapshot: Box<WorldSnapshot>,
        readiness: ReadinessEvaluation,
    },
    Readiness {
        evaluation: ReadinessEvaluation,
    },
    Children {
        objects: Vec<ModelObject>,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "status", rename_all = "camelCase")]
#[ts(tag = "status", rename_all = "camelCase")]
pub enum CoreResponse {
    Ok {
        #[serde(rename = "apiVersion")]
        #[ts(rename = "apiVersion")]
        api_version: u32,
        result: Box<CoreResult>,
    },
    Error {
        #[serde(rename = "apiVersion")]
        #[ts(rename = "apiVersion")]
        api_version: u32,
        code: String,
        message: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CoreError {
    ResourceLimit(String),
    Evaluation(String),
    NotConfigured(String),
}

impl CoreError {
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::ResourceLimit(_) => "resource_limit",
            Self::Evaluation(_) => "evaluation_error",
            Self::NotConfigured(_) => "not_configured",
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::ResourceLimit(message)
            | Self::Evaluation(message)
            | Self::NotConfigured(message) => message,
        }
    }
}

#[must_use]
pub fn compiled_rule_pack_catalog() -> Vec<CompiledRulePack> {
    vec![
        CompiledRulePack {
            id: "core-foundation".into(),
            version: "1".into(),
            title: "Core model integrity".into(),
            required_for_world_template_ids: vec!["*".into()],
        },
        CompiledRulePack {
            id: ASSISTANT_IMPACT_PACK_ID.into(),
            version: ASSISTANT_IMPACT_PACK_VERSION.into(),
            title: "Advisory personal assistant change impact".into(),
            required_for_world_template_ids: vec![],
        },
        CompiledRulePack {
            id: "assistant-foundation".into(),
            version: "1".into(),
            title: "Personal assistant foundation".into(),
            required_for_world_template_ids: vec!["assistant-world".into()],
        },
    ]
}

fn canonicalize_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Array(values) => {
            let mut canonical = values
                .into_iter()
                .map(canonicalize_json)
                .collect::<Vec<_>>();
            canonical.sort_by_key(serde_json::Value::to_string);
            serde_json::Value::Array(canonical)
        }
        serde_json::Value::Object(values) => serde_json::Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, canonicalize_json(value)))
                .collect(),
        ),
        scalar => scalar,
    }
}

/// Canonical content digest shared by snapshot and advisory evidence projections.
/// # Errors
/// Returns an evaluation error when the value cannot be serialized.
pub fn content_hash<T: Serialize>(value: &T) -> Result<String, CoreError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let value = serde_json::to_value(value)
        .map(canonicalize_json)
        .map_err(|error| CoreError::Evaluation(format!("input hashing failed: {error}")))?;
    let json = serde_json::to_vec(&value)
        .map_err(|error| CoreError::Evaluation(format!("input hashing failed: {error}")))?;
    let digest = Sha256::digest(json);
    let mut output = String::with_capacity(64);
    for byte in digest {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    Ok(output)
}

ascent! {
    struct DependencyProgram;
    relation edge(String, String);
    relation path(String, String);

    path(from, to) <-- edge(from, to);
    path(from, to) <-- edge(from, via), path(via, to);
}

fn source(reference: impl Into<String>) -> Source {
    Source {
        kind: SourceKind::Declared,
        reference: reference.into(),
    }
}

fn derived_source(reference: impl Into<String>) -> Source {
    Source {
        kind: SourceKind::Derived,
        reference: reference.into(),
    }
}

fn finding(
    rule_id: impl Into<String>,
    severity: &str,
    message: impl Into<String>,
    object_ids: Vec<String>,
    fact_ids: Vec<String>,
    source: Source,
) -> Finding {
    Finding {
        rule_id: rule_id.into(),
        severity: severity.into(),
        message: message.into(),
        object_ids,
        fact_ids,
        source,
    }
}

fn supporting_path(from: &str, to: &str, relations: &[&ModelRelation]) -> Vec<String> {
    let mut ordered_relations = relations.to_vec();
    ordered_relations.sort_by(|left, right| {
        left.from_id
            .cmp(&right.from_id)
            .then_with(|| left.to_id.cmp(&right.to_id))
            .then_with(|| left.id.cmp(&right.id))
    });
    let mut queue = VecDeque::from([(from.to_owned(), Vec::new())]);
    let mut visited = HashSet::from([from.to_owned()]);
    while let Some((current, path)) = queue.pop_front() {
        for relation in ordered_relations
            .iter()
            .filter(|relation| relation.from_id == current)
        {
            let mut next_path = path.clone();
            next_path.push(relation.id.clone());
            if relation.to_id == to {
                return next_path;
            }
            if visited.insert(relation.to_id.clone()) {
                queue.push_back((relation.to_id.clone(), next_path));
            }
        }
    }
    Vec::new()
}

fn validate_typed_reference(
    objects: &HashMap<&str, &ModelObject>,
    reference: &str,
    expected_kind: &str,
    context: &str,
    provenance: Source,
    findings: &mut Vec<Finding>,
) {
    match objects.get(reference) {
        None => findings.push(finding(
            "core.references-resolve",
            "blocker",
            format!("{context} references missing object {reference}"),
            vec![reference.into()],
            Vec::new(),
            provenance,
        )),
        Some(object) if object.kind != expected_kind => findings.push(finding(
            "core.typed-references",
            "blocker",
            format!(
                "{context} requires {expected_kind}, but {reference} is {}",
                object.kind
            ),
            vec![reference.into()],
            Vec::new(),
            provenance,
        )),
        Some(_) => {}
    }
}

/// Evaluates one pinned snapshot against its template and compiled rules.
///
/// # Errors
///
/// Returns [`CoreError::ResourceLimit`] when declared input or inferred facts
/// exceed deterministic execution bounds, or [`CoreError::Evaluation`] if the
/// typed snapshot cannot be serialized for content-addressed evaluation IDs.
#[allow(clippy::too_many_lines)]
pub fn evaluate_readiness(snapshot: &WorldSnapshot) -> Result<ReadinessEvaluation, CoreError> {
    if snapshot.objects.len() > MAX_OBJECTS {
        return Err(CoreError::ResourceLimit(format!(
            "objects exceed limit of {MAX_OBJECTS}"
        )));
    }
    if snapshot.relations.len() > MAX_RELATIONS {
        return Err(CoreError::ResourceLimit(format!(
            "relations exceed limit of {MAX_RELATIONS}"
        )));
    }
    let bounded_collections = [
        ("Things", snapshot.things.len(), MAX_THINGS),
        (
            "Thing Templates",
            snapshot.thing_templates.len(),
            MAX_THING_TEMPLATES,
        ),
        (
            "template object shapes",
            snapshot.template.object_shapes.len(),
            MAX_TEMPLATE_SHAPES,
        ),
        (
            "allowed relation endpoints",
            snapshot.template.allowed_relation_endpoints.len(),
            MAX_RELATION_ENDPOINTS,
        ),
        (
            "required relations",
            snapshot.template.required_relations.len(),
            MAX_REQUIRED_RELATIONS,
        ),
        (
            "forbidden cycle rules",
            snapshot.template.forbidden_cycles.len(),
            MAX_FORBIDDEN_CYCLE_RULES,
        ),
        (
            "constraint rules",
            snapshot.template.incompatible_constraints.len(),
            MAX_CONSTRAINT_RULES,
        ),
        ("Rule Pack pins", snapshot.rule_packs.len(), MAX_RULE_PACKS),
        (
            "required Rule Packs",
            snapshot.template.required_rule_packs.len(),
            MAX_RULE_PACKS,
        ),
        (
            "completeness declarations",
            snapshot.completeness.len(),
            MAX_COMPLETENESS_DECLARATIONS,
        ),
        (
            "Theory claims",
            snapshot.theory.claims.len(),
            MAX_THEORY_CLAIMS,
        ),
        ("Moves", snapshot.moves.len(), MAX_MOVES),
    ];
    if let Some((name, _, limit)) = bounded_collections
        .into_iter()
        .find(|(_, actual, limit)| actual > limit)
    {
        return Err(CoreError::ResourceLimit(format!(
            "{name} exceed limit of {limit}"
        )));
    }

    let mut findings = Vec::new();
    let objects: HashMap<&str, &ModelObject> = snapshot
        .objects
        .iter()
        .map(|object| (object.id.as_str(), object))
        .collect();
    let things: HashSet<&str> = snapshot
        .things
        .iter()
        .map(|thing| thing.id.as_str())
        .collect();
    let shapes: HashMap<&str, &ObjectShape> = snapshot
        .template
        .object_shapes
        .iter()
        .map(|shape| (shape.kind.as_str(), shape))
        .collect();

    let shape_ids: HashSet<&str> = snapshot
        .template
        .object_shapes
        .iter()
        .map(|shape| shape.id.as_str())
        .collect();
    if shapes.len() != snapshot.template.object_shapes.len()
        || shape_ids.len() != snapshot.template.object_shapes.len()
    {
        findings.push(finding(
            "core.shape-ids-unique",
            "blocker",
            "shape IDs and runtime kinds must be unique",
            Vec::new(),
            Vec::new(),
            source(format!(
                "template:{}@{}",
                snapshot.template.id, snapshot.template.version
            )),
        ));
    }

    let world_objects = snapshot
        .objects
        .iter()
        .filter(|object| object.kind == "world")
        .collect::<Vec<_>>();
    if world_objects.len() != 1
        || !world_objects
            .iter()
            .any(|object| object.id == snapshot.world_id && object.parent_id.is_none())
    {
        findings.push(finding(
            "core.world-root",
            "blocker",
            "a snapshot requires exactly one root World object matching worldId",
            vec![snapshot.world_id.clone()],
            Vec::new(),
            derived_source("compiled-rule:core.world-root"),
        ));
    }

    if objects.len() != snapshot.objects.len() {
        findings.push(finding(
            "core.ids-unique",
            "blocker",
            "object IDs must be unique",
            Vec::new(),
            Vec::new(),
            source(format!("revision:{}", snapshot.revision_id)),
        ));
    }
    let thing_ids: HashSet<&str> = snapshot
        .things
        .iter()
        .map(|thing| thing.id.as_str())
        .collect();
    if thing_ids.len() != snapshot.things.len() {
        findings.push(finding(
            "core.ids-unique",
            "blocker",
            "Thing IDs must be unique",
            Vec::new(),
            Vec::new(),
            source(format!("revision:{}", snapshot.revision_id)),
        ));
    }
    let thing_templates: HashMap<(&str, &str), &ThingTemplate> = snapshot
        .thing_templates
        .iter()
        .map(|template| ((template.id.as_str(), template.version.as_str()), template))
        .collect();
    if thing_templates.len() != snapshot.thing_templates.len() {
        findings.push(finding(
            "core.thing-template-definitions-unique",
            "blocker",
            "Thing Template ID/version pairs must be unique",
            Vec::new(),
            Vec::new(),
            source(format!("revision:{}", snapshot.revision_id)),
        ));
    }
    let world_template_ref = VersionRef {
        id: snapshot.template.id.clone(),
        version: snapshot.template.version.clone(),
    };
    for thing in &snapshot.things {
        if thing.revision_id.is_empty()
            || thing.template_ref.id.is_empty()
            || thing.template_ref.version.is_empty()
        {
            findings.push(finding(
                "core.thing-references-pinned",
                "blocker",
                format!(
                    "Thing {} must pin both a revision and Template reference",
                    thing.id
                ),
                vec![thing.id.clone()],
                Vec::new(),
                thing.source.clone(),
            ));
        }
        let Some(template) = thing_templates.get(&(
            thing.template_ref.id.as_str(),
            thing.template_ref.version.as_str(),
        )) else {
            findings.push(finding(
                "core.thing-template-resolves",
                "blocker",
                format!(
                    "Thing {} references missing Thing Template {}@{}",
                    thing.id, thing.template_ref.id, thing.template_ref.version
                ),
                vec![thing.id.clone()],
                Vec::new(),
                thing.source.clone(),
            ));
            continue;
        };
        if !template
            .compatible_world_templates
            .contains(&world_template_ref)
        {
            findings.push(finding(
                "core.thing-template-compatible",
                "blocker",
                format!(
                    "Thing Template {}@{} is incompatible with World Template {}@{}",
                    template.id, template.version, snapshot.template.id, snapshot.template.version
                ),
                vec![thing.id.clone()],
                Vec::new(),
                source(format!(
                    "thing-template:{}@{}",
                    template.id, template.version
                )),
            ));
        }
        if !template.inherits_world_context {
            findings.push(finding(
                "core.thing-template-inherits-context",
                "blocker",
                format!(
                    "Thing Template {}@{} must inherit pinned World context",
                    template.id, template.version
                ),
                vec![thing.id.clone()],
                Vec::new(),
                source(format!(
                    "thing-template:{}@{}",
                    template.id, template.version
                )),
            ));
        }
        if thing.capabilities != template.capabilities {
            findings.push(finding(
                "core.thing-template-capabilities",
                "blocker",
                format!(
                    "Thing {} capabilities do not match Thing Template {}@{}",
                    thing.id, template.id, template.version
                ),
                vec![thing.id.clone()],
                Vec::new(),
                thing.source.clone(),
            ));
        }
    }
    if snapshot.revision_id.is_empty()
        || snapshot.template.id.is_empty()
        || snapshot.template.version.is_empty()
    {
        findings.push(finding(
            "core.world-references-pinned",
            "blocker",
            "World revision and Template ID/version must be pinned",
            vec![snapshot.world_id.clone()],
            Vec::new(),
            source(format!("world:{}", snapshot.world_id)),
        ));
    }
    let pack_ids: HashSet<&str> = snapshot
        .rule_packs
        .iter()
        .map(|pack| pack.id.as_str())
        .collect();
    if pack_ids.len() != snapshot.rule_packs.len()
        || snapshot
            .rule_packs
            .iter()
            .any(|pack| pack.id.is_empty() || pack.version.is_empty())
    {
        findings.push(finding(
            "core.rule-packs-pinned",
            "blocker",
            "Rule Pack IDs must be unique and each version must be pinned",
            Vec::new(),
            Vec::new(),
            source(format!("revision:{}", snapshot.revision_id)),
        ));
    }
    let compiled_packs = compiled_rule_pack_catalog();
    let compiled_versions: HashSet<(&str, &str)> = compiled_packs
        .iter()
        .map(|pack| (pack.id.as_str(), pack.version.as_str()))
        .collect();
    for pack in snapshot
        .rule_packs
        .iter()
        .chain(snapshot.template.required_rule_packs.iter())
    {
        if !compiled_versions.contains(&(pack.id.as_str(), pack.version.as_str())) {
            findings.push(finding(
                "core.compiled-rule-packs",
                "blocker",
                format!(
                    "Rule Pack {}@{} is not compiled into {EVALUATOR_VERSION}",
                    pack.id, pack.version
                ),
                Vec::new(),
                Vec::new(),
                source(format!("evaluator:{EVALUATOR_VERSION}")),
            ));
        }
    }
    let mut required_packs = snapshot.template.required_rule_packs.clone();
    for pack in &compiled_packs {
        if pack
            .required_for_world_template_ids
            .iter()
            .any(|id| id == "*" || id == &snapshot.template.id)
            && !required_packs
                .iter()
                .any(|required| required.id == pack.id && required.version == pack.version)
        {
            required_packs.push(RulePackPin {
                id: pack.id.clone(),
                version: pack.version.clone(),
            });
        }
    }
    for required in required_packs {
        if !snapshot
            .rule_packs
            .iter()
            .any(|pin| pin.id == required.id && pin.version == required.version)
        {
            findings.push(finding(
                "core.required-rule-packs",
                "blocker",
                format!(
                    "World Template {}@{} requires compiled Rule Pack {}@{}",
                    snapshot.template.id, snapshot.template.version, required.id, required.version
                ),
                Vec::new(),
                Vec::new(),
                source(format!("evaluator:{EVALUATOR_VERSION}")),
            ));
        }
    }
    let relation_ids: HashSet<&str> = snapshot
        .relations
        .iter()
        .map(|relation| relation.id.as_str())
        .collect();
    if relation_ids.len() != snapshot.relations.len() {
        findings.push(finding(
            "core.ids-unique",
            "blocker",
            "relation IDs must be unique",
            Vec::new(),
            Vec::new(),
            source(format!("revision:{}", snapshot.revision_id)),
        ));
    }

    let revision_source = source(format!("revision:{}", snapshot.revision_id));
    for reference in &snapshot.purpose.beneficiary_ids {
        validate_typed_reference(
            &objects,
            reference,
            "beneficiary",
            "Purpose beneficiary",
            revision_source.clone(),
            &mut findings,
        );
    }
    for reference in &snapshot.purpose.outcome_ids {
        validate_typed_reference(
            &objects,
            reference,
            "outcome",
            "Purpose outcome",
            revision_source.clone(),
            &mut findings,
        );
    }
    validate_typed_reference(
        &objects,
        &snapshot.environment.id,
        "environment",
        "Environment model",
        revision_source,
        &mut findings,
    );
    for claim in &snapshot.theory.claims {
        validate_typed_reference(
            &objects,
            &claim.outcome_id,
            "outcome",
            &format!("Theory claim {} outcome", claim.id),
            claim.source.clone(),
            &mut findings,
        );
        for reference in &claim.indicator_ids {
            validate_typed_reference(
                &objects,
                reference,
                "indicator",
                &format!("Theory claim {} indicator", claim.id),
                claim.source.clone(),
                &mut findings,
            );
        }
        for reference in &claim.evaluation_ids {
            validate_typed_reference(
                &objects,
                reference,
                "evaluationPlan",
                &format!("Theory claim {} evaluation", claim.id),
                claim.source.clone(),
                &mut findings,
            );
        }
    }

    for object in &snapshot.objects {
        match shapes.get(object.kind.as_str()) {
            None => findings.push(finding(
                "core.shape-known",
                "blocker",
                format!("object {} uses unknown shape {}", object.id, object.kind),
                vec![object.id.clone()],
                Vec::new(),
                object.source.clone(),
            )),
            Some(shape) => {
                let missing = shape
                    .required_properties
                    .iter()
                    .filter(|key| !object.properties.contains_key(key.as_str()))
                    .cloned()
                    .collect::<Vec<_>>();
                if !missing.is_empty() {
                    findings.push(finding(
                        "core.shape-required-properties",
                        "blocker",
                        format!(
                            "object {} is missing properties: {}",
                            object.id,
                            missing.join(", ")
                        ),
                        vec![object.id.clone()],
                        Vec::new(),
                        source(format!("shape:{}", shape.id)),
                    ));
                }
            }
        }
        if let Some(thing_id) = object.thing_id.as_deref()
            && !things.contains(thing_id)
        {
            findings.push(finding(
                "core.references-resolve",
                "blocker",
                format!("object {} references missing Thing {thing_id}", object.id),
                vec![object.id.clone()],
                Vec::new(),
                object.source.clone(),
            ));
        }
        if let Some(parent_id) = object.parent_id.as_deref()
            && !objects.contains_key(parent_id)
        {
            findings.push(finding(
                "core.references-resolve",
                "blocker",
                format!("object {} references missing parent {parent_id}", object.id),
                vec![object.id.clone()],
                Vec::new(),
                object.source.clone(),
            ));
        }
    }

    let allowed = &snapshot.template.allowed_relation_endpoints;
    for relation in &snapshot.relations {
        let Some(from) = objects.get(relation.from_id.as_str()) else {
            findings.push(finding(
                "core.references-resolve",
                "blocker",
                format!(
                    "relation {} has missing source {}",
                    relation.id, relation.from_id
                ),
                vec![relation.from_id.clone()],
                vec![relation.id.clone()],
                relation.source.clone(),
            ));
            continue;
        };
        let Some(to) = objects.get(relation.to_id.as_str()) else {
            findings.push(finding(
                "core.references-resolve",
                "blocker",
                format!(
                    "relation {} has missing target {}",
                    relation.id, relation.to_id
                ),
                vec![relation.to_id.clone()],
                vec![relation.id.clone()],
                relation.source.clone(),
            ));
            continue;
        };
        let legal = allowed.iter().any(|endpoint| {
            endpoint.relation_kind == relation.kind
                && endpoint.from_kinds.contains(&from.kind)
                && endpoint.to_kinds.contains(&to.kind)
        });
        if !legal {
            findings.push(finding(
                "core.relation-endpoints-legal",
                "blocker",
                format!(
                    "relation {} cannot connect {} to {}",
                    relation.kind, from.kind, to.kind
                ),
                vec![from.id.clone(), to.id.clone()],
                vec![relation.id.clone()],
                relation.source.clone(),
            ));
        }
    }

    let mut completeness: HashMap<&str, Vec<&CompletenessDeclaration>> = HashMap::new();
    for declaration in &snapshot.completeness {
        completeness
            .entry(declaration.scope_id.as_str())
            .or_default()
            .push(declaration);
    }
    for (scope_id, declarations) in &completeness {
        if declarations.len() > 1 {
            findings.push(finding(
                "core.completeness-declarations-unique",
                "blocker",
                format!("scope {scope_id} has duplicate completeness declarations"),
                Vec::new(),
                declarations
                    .iter()
                    .map(|declaration| declaration.source.reference.clone())
                    .collect(),
                source(format!("revision:{}", snapshot.revision_id)),
            ));
        }
    }
    let mandatory_scopes = snapshot
        .template
        .required_relations
        .iter()
        .map(|requirement| requirement.scope_id.as_str())
        .collect::<BTreeSet<_>>();
    for scope_id in mandatory_scopes {
        let declarations = completeness.get(scope_id);
        let unique = declarations.and_then(|items| (items.len() == 1).then_some(items[0]));
        if declarations.is_none()
            || unique.is_some_and(|item| item.status == CompletenessStatus::Incomplete)
        {
            findings.push(finding(
                "core.mandatory-scope-incomplete",
                "unknown",
                format!("mandatory relation scope {scope_id} is not declared complete"),
                Vec::new(),
                Vec::new(),
                source(format!(
                    "template:{}@{}",
                    snapshot.template.id, snapshot.template.version
                )),
            ));
        }
    }
    for requirement in &snapshot.template.required_relations {
        for subject in snapshot
            .objects
            .iter()
            .filter(|object| object.kind == requirement.subject_kind)
        {
            let satisfied = snapshot.relations.iter().any(|relation| {
                relation.from_id == subject.id
                    && relation.kind == requirement.relation_kind
                    && objects
                        .get(relation.to_id.as_str())
                        .is_some_and(|object| object.kind == requirement.object_kind)
            });
            if !satisfied {
                let declaration = completeness
                    .get(requirement.scope_id.as_str())
                    .and_then(|items| (items.len() == 1).then_some(items[0]));
                let (severity, message) = match declaration.map(|item| &item.status) {
                    Some(CompletenessStatus::Complete) => (
                        "blocker",
                        format!(
                            "{} requires a {} relation to {}",
                            subject.id, requirement.relation_kind, requirement.object_kind
                        ),
                    ),
                    _ => (
                        "unknown",
                        format!(
                            "{} may require a {} relation; scope {} is incomplete",
                            subject.id, requirement.relation_kind, requirement.scope_id
                        ),
                    ),
                };
                findings.push(finding(
                    requirement.rule_id.clone(),
                    severity,
                    message,
                    vec![subject.id.clone()],
                    Vec::new(),
                    source(format!(
                        "template:{}@{}",
                        snapshot.template.id, snapshot.template.version
                    )),
                ));
            }
        }
    }

    let active: HashSet<&str> = snapshot
        .active_constraints
        .iter()
        .map(String::as_str)
        .collect();
    for incompatibility in &snapshot.template.incompatible_constraints {
        if active.contains(incompatibility.left.as_str())
            && active.contains(incompatibility.right.as_str())
        {
            findings.push(finding(
                incompatibility.rule_id.clone(),
                "blocker",
                format!(
                    "constraints {} and {} are incompatible",
                    incompatibility.left, incompatibility.right
                ),
                Vec::new(),
                Vec::new(),
                source(format!(
                    "template:{}@{}",
                    snapshot.template.id, snapshot.template.version
                )),
            ));
        }
    }

    let cycle_inputs = snapshot
        .template
        .forbidden_cycles
        .iter()
        .map(|cycle_rule| {
            snapshot
                .relations
                .iter()
                .filter(|relation| cycle_rule.relation_kinds.contains(&relation.kind))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let estimated_inference_facts = cycle_inputs.iter().try_fold(0_usize, |total, eligible| {
        let node_count = eligible
            .iter()
            .flat_map(|relation| [&relation.from_id, &relation.to_id])
            .collect::<HashSet<_>>()
            .len();
        total.checked_add(node_count.saturating_mul(node_count))
    });
    if estimated_inference_facts.is_none_or(|count| count > MAX_DERIVED_FACTS) {
        return Err(CoreError::ResourceLimit(format!(
            "dependency inference could exceed limit of {MAX_DERIVED_FACTS} derived facts"
        )));
    }

    let mut derived_facts = Vec::new();
    for (cycle_rule, eligible) in snapshot.template.forbidden_cycles.iter().zip(cycle_inputs) {
        let mut program = DependencyProgram {
            edge: eligible
                .iter()
                .map(|relation| (relation.from_id.clone(), relation.to_id.clone()))
                .collect(),
            ..Default::default()
        };
        program.run();
        if program.path.len() > MAX_DERIVED_FACTS {
            return Err(CoreError::ResourceLimit(format!(
                "derived facts exceed limit of {MAX_DERIVED_FACTS}"
            )));
        }
        let mut seen = BTreeSet::new();
        let mut paths = program.path;
        paths.sort();
        for (from, to) in paths {
            if from != to && seen.insert((from.clone(), to.clone())) {
                let supporting = supporting_path(&from, &to, &eligible);
                derived_facts.push(DerivedFact {
                    id: format!("derived:{}:{}:{}", cycle_rule.rule_id, from, to),
                    kind: "dependsTransitivelyOn".into(),
                    from_id: from,
                    to_id: to,
                    fact_ids: supporting,
                    source: derived_source(format!("compiled-rule:{}", cycle_rule.rule_id)),
                });
            } else if from == to {
                let supporting = supporting_path(&from, &to, &eligible);
                findings.push(finding(
                    cycle_rule.rule_id.clone(),
                    "blocker",
                    format!("forbidden dependency cycle includes {from}"),
                    vec![from],
                    supporting,
                    derived_source(format!("compiled-rule:{}", cycle_rule.rule_id)),
                ));
            }
        }
    }
    if derived_facts.len() > MAX_DERIVED_FACTS {
        return Err(CoreError::ResourceLimit(format!(
            "derived facts exceed limit of {MAX_DERIVED_FACTS}"
        )));
    }

    let status = if findings.iter().any(|item| item.severity == "blocker") {
        ReadinessStatus::Blocked
    } else if findings.iter().any(|item| item.severity == "unknown") {
        ReadinessStatus::Unknown
    } else {
        ReadinessStatus::Ready
    };
    findings.sort_by(|left, right| {
        left.rule_id
            .cmp(&right.rule_id)
            .then_with(|| left.severity.cmp(&right.severity))
            .then_with(|| left.object_ids.cmp(&right.object_ids))
            .then_with(|| left.fact_ids.cmp(&right.fact_ids))
            .then_with(|| left.message.cmp(&right.message))
            .then_with(|| left.source.reference.cmp(&right.source.reference))
    });
    derived_facts.sort_by(|left, right| left.id.cmp(&right.id));
    let snapshot_hash = content_hash(snapshot)?;
    let template_hash = content_hash(&snapshot.template)?;

    Ok(ReadinessEvaluation {
        world_id: snapshot.world_id.clone(),
        revision_id: snapshot.revision_id.clone(),
        template_id: snapshot.template.id.clone(),
        template_version: snapshot.template.version.clone(),
        snapshot_hash,
        template_hash,
        evaluator_version: EVALUATOR_VERSION.into(),
        rule_packs: snapshot.rule_packs.clone(),
        status,
        findings,
        derived_facts,
        outcome_assessments: snapshot
            .purpose
            .outcome_ids
            .iter()
            .map(|outcome_id| OutcomeAssessment {
                outcome_id: outcome_id.clone(),
                status: "unknown".into(),
                message: "future outcome evidence has not been observed".into(),
            })
            .collect(),
    })
}

#[must_use]
pub fn query(request: CoreRequest) -> CoreResponse {
    if request.api_version != 1 {
        return CoreResponse::Error {
            api_version: 1,
            code: "unsupported_api_version".into(),
            message: format!("unsupported apiVersion {}; expected 1", request.api_version),
        };
    }
    if let Query::ChangeImpact { baseline, context } = &request.query {
        return match impact::evaluate_change_impact(baseline, &request.snapshot, context) {
            Ok(report) => CoreResponse::Ok {
                api_version: 1,
                result: Box::new(CoreResult::ChangeImpact { report }),
            },
            Err(error) => CoreResponse::Error {
                api_version: 1,
                code: error.code().into(),
                message: error.message().into(),
            },
        };
    }
    if let Query::ApplyImpactPatch {
        patch,
        draft_revision_id,
    } = &request.query
    {
        return match impact::apply_impact_patch(&request.snapshot, patch, draft_revision_id) {
            Ok(snapshot) => CoreResponse::Ok {
                api_version: 1,
                result: Box::new(CoreResult::ImpactPatched {
                    snapshot: Box::new(snapshot),
                }),
            },
            Err(error) => CoreResponse::Error {
                api_version: 1,
                code: error.code().into(),
                message: error.message().into(),
            },
        };
    }
    let evaluation = match evaluate_readiness(&request.snapshot) {
        Ok(evaluation) => evaluation,
        Err(error) => {
            return CoreResponse::Error {
                api_version: 1,
                code: error.code().into(),
                message: error.message().into(),
            };
        }
    };
    let result = match request.query {
        Query::ChangeImpact { .. } | Query::ApplyImpactPatch { .. } => {
            unreachable!("impact queries dispatched above")
        }
        Query::Workspace => CoreResult::Workspace {
            snapshot: Box::new(request.snapshot),
            readiness: evaluation,
        },
        Query::Readiness => CoreResult::Readiness { evaluation },
        Query::Children { parent_id } => CoreResult::Children {
            objects: request
                .snapshot
                .objects
                .into_iter()
                .filter(|object| object.parent_id.as_deref() == Some(parent_id.as_str()))
                .collect(),
        },
    };
    CoreResponse::Ok {
        api_version: 1,
        result: Box::new(result),
    }
}

fn serialize_response(response: &CoreResponse) -> String {
    match serde_json::to_string(response) {
        Ok(json) => json,
        Err(_) => String::from(
            r#"{"status":"error","apiVersion":1,"code":"serialization_error","message":"response serialization failed"}"#,
        ),
    }
}

#[must_use]
pub fn handle_request(input: &str) -> String {
    if input.len() > MAX_REQUEST_BYTES {
        return serialize_response(&CoreResponse::Error {
            api_version: 1,
            code: "resource_limit".into(),
            message: format!("request exceeds limit of {MAX_REQUEST_BYTES} bytes"),
        });
    }
    let version = serde_json::from_str::<serde_json::Value>(input)
        .ok()
        .and_then(|value| value.get("apiVersion").and_then(serde_json::Value::as_u64));
    if version.is_some_and(|version| version != 1) {
        return serialize_response(&CoreResponse::Error {
            api_version: 1,
            code: "unsupported_api_version".into(),
            message: format!(
                "unsupported apiVersion {}; expected 1",
                version.unwrap_or(0)
            ),
        });
    }
    let response = match serde_json::from_str::<CoreRequest>(input) {
        Ok(request) => query(request),
        Err(error) => CoreResponse::Error {
            api_version: 1,
            code: "malformed_request".into(),
            message: format!("request does not match the v1 contract: {error}"),
        },
    };
    serialize_response(&response)
}

pub mod assistant_impact;
pub mod impact;
pub mod impact_types;
pub use impact_types::*;
pub mod fixtures;
pub mod realization;
pub use realization::handle_world_command;

/// Returns the complete public TypeScript wire contract from Rust definitions.
#[must_use]
pub fn typescript_contract() -> String {
    macro_rules! declarations {
        ($($type:ty),+ $(,)?) => {{
            let mut output = String::from("// Generated by bropilot-contract-gen. Do not edit.\n\n");
            $(
                output.push_str("export ");
                output.push_str(&<$type as TS>::decl());
                output.push_str("\n\n");
            )+
            output
        }};
    }
    let mut output = declarations!(
        Source,
        SourceKind,
        VersionRef,
        ObjectShape,
        RelationEndpoint,
        RequiredRelation,
        ForbiddenCycle,
        IncompatibleConstraint,
        WorldTemplate,
        Purpose,
        Environment,
        ThingCapabilities,
        ExternalReference,
        ThingTemplate,
        CompiledRulePack,
        StateKind,
        Thing,
        ModelObject,
        ModelRelation,
        CompletenessStatus,
        CompletenessDeclaration,
        TheoryClaim,
        Theory,
        MoveSummary,
        RulePackPin,
        WorldSnapshot,
        Query,
        CoreRequest,
        ReadinessStatus,
        Finding,
        DerivedFact,
        OutcomeAssessment,
        ReadinessEvaluation,
        WorkspaceResult,
        CoreResult,
        CoreResponse,
    );
    output.push_str(&impact_types::typescript_contract());
    output.push_str(&realization::typescript_contract());
    output
}
