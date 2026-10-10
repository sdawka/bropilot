//! Synthetic assistant impact examples and fixed typed metric projection.
//! Values are ratios in [0, 1] from sample arithmetic, never observed outcome proof.
use crate::{
    ASSISTANT_IMPACT_PACK_ID, ASSISTANT_IMPACT_PACK_VERSION, BoundObjectInput, BoundRelationInput,
    BoundThingRevision, CompletenessDeclaration, CompletenessStatus, CompletionObservation,
    CoreError, EvidenceBinding, EvidenceProvenance, IMPACT_CRITERION_SCOPE,
    IMPACT_DEPENDENCY_SCOPE, IMPACT_METRIC_SCOPE, MAX_OBJECTS, MAX_RELATIONS, MetricAssessment,
    MetricComparability, MetricComparison, MetricDefinition, MetricStatus, ModelObject,
    ModelRelation, ObjectShape, PlanItem, PlanItemStatus, RelationEndpoint, ReportingWindow,
    RulePackPin, Source, SourceKind, StateKind, Thing, ThingCapabilities, ThingTemplate,
    VersionRef, WorldSnapshot, content_hash, fixtures,
};
use std::collections::{BTreeMap, BTreeSet};

pub const METRIC_ID: &str = "metric-completed-planned-work";
pub const DEFINITION_ID: &str = "definition-completed-planned-work";
pub const WINDOW_START: &str = "2026-10-05T00:00:00Z";
pub const WINDOW_END: &str = "2026-10-12T00:00:00Z";

#[must_use]
pub fn ids() -> &'static [&'static str] {
    &[
        "assistant-impact-baseline",
        "assistant-impact-calendar-adapter",
        "assistant-impact-completion",
        "assistant-impact-interface",
        "assistant-impact-removed-dependency",
        "assistant-impact-metric-definition",
        "assistant-impact-incomplete",
    ]
}

fn synthetic_source(id: &str) -> Source {
    Source {
        kind: SourceKind::Declared,
        reference: format!("fixture:synthetic:assistant-impact:{id}"),
    }
}

fn object(
    id: &str,
    kind: &str,
    title: &str,
    thing: Option<&str>,
    properties: &[(&str, &str)],
) -> ModelObject {
    ModelObject {
        id: id.into(),
        kind: kind.into(),
        title: title.into(),
        thing_id: thing.map(str::to_owned),
        parent_id: Some("assistant-world".into()),
        properties: properties
            .iter()
            .map(|(key, value)| ((*key).into(), (*value).into()))
            .collect(),
        source: synthetic_source(id),
    }
}

fn relation(id: &str, kind: &str, dependent: &str, dependency: &str) -> ModelRelation {
    ModelRelation {
        id: id.into(),
        kind: kind.into(),
        from_id: dependent.into(),
        to_id: dependency.into(),
        source: synthetic_source(id),
    }
}

/// Canonical definition digest includes the fixed output unit.
/// # Errors
/// Returns an error if canonical serialization fails.
pub fn metric_definition_hash(definition: &MetricDefinition) -> Result<String, CoreError> {
    content_hash(&serde_json::json!({"definition":definition,"unit":"ratio"}))
}

fn definition_name(definition: &MetricDefinition) -> &'static str {
    match definition {
        MetricDefinition::CompletedPlannedTasks => "completedPlannedTasks",
        MetricDefinition::CompletedPlannedTasksIncludingCancelled => {
            "completedPlannedTasksIncludingCancelled"
        }
    }
}

#[allow(clippy::too_many_lines)]
fn base() -> WorldSnapshot {
    let mut model = fixtures::snapshot("assistant-valid").expect("existing assistant fixture");
    model.revision_id = ids()[0].into();
    model.title = "Synthetic personal assistant impact example".into();
    model.state_kind = StateKind::Canonical;
    model.things.push(Thing {
        id: "thing-calendar-adapter".into(),
        kind: "adapter".into(),
        title: "Managed calendar adapter".into(),
        revision_id: "calendar-adapter@1".into(),
        template_ref: VersionRef {
            id: "managed-adapter".into(),
            version: "1".into(),
        },
        capabilities: ThingCapabilities {
            external: false,
            forkable: true,
            observable: true,
            reversible: true,
        },
        external_reference: None,
        source: synthetic_source("thing-calendar-adapter"),
    });
    model.thing_templates.push(ThingTemplate {
        id: "managed-adapter".into(),
        version: "1".into(),
        title: "Managed calendar adapter".into(),
        compatible_world_templates: vec![VersionRef {
            id: "assistant-world".into(),
            version: "1".into(),
        }],
        inherits_world_context: true,
        capabilities: ThingCapabilities {
            external: false,
            forkable: true,
            observable: true,
            reversible: true,
        },
    });
    // Existing calendar boundary remains external; the adapter has its own managed Thing.
    for node in &mut model.objects {
        node.source = synthetic_source(&node.id);
        if node.id == "calendar-1"
            || node.id == "criterion-1"
            || node.id == "assay-1"
            || node.kind == "calendarBlock"
        {
            node.thing_id = Some("thing-calendar-adapter".into());
        }
        if node.id == "calendar-1" {
            node.parent_id = Some("node-thing-calendar-adapter".into());
        }
    }
    model.objects.extend([
        object(
            "node-thing-calendar-adapter",
            "thing",
            "Managed calendar adapter",
            Some("thing-calendar-adapter"),
            &[],
        ),
        object(
            "external-calendar",
            "capability",
            "Disconnected external calendar",
            Some("thing-calendar"),
            &[("connectionStatus", "disconnected")],
        ),
        object(
            "availability-calendar",
            "capability",
            "Declared sample calendar availability",
            Some("thing-calendar-adapter"),
            &[],
        ),
        object(
            "scheduling",
            "capability",
            "Scheduling",
            Some("thing-planning"),
            &[],
        ),
        object(
            "weekly-plan",
            "capability",
            "Weekly plan",
            Some("thing-planning"),
            &[],
        ),
        object(
            "progress-review",
            "capability",
            "Progress review",
            Some("thing-progress"),
            &[],
        ),
        object(
            DEFINITION_ID,
            "metricDefinition",
            "Unique completed planned tasks / unique eligible planned tasks",
            Some("thing-progress"),
            &[
                ("metricDefinition", "completedPlannedTasks"),
                ("unit", "ratio"),
            ],
        ),
        object(
            METRIC_ID,
            "metric",
            "Completed planned work (synthetic sample)",
            Some("thing-progress"),
            &[
                ("metricDefinition", "completedPlannedTasks"),
                ("windowStart", WINDOW_START),
                ("windowEnd", WINDOW_END),
                ("unit", "ratio"),
                (
                    "definitionHash",
                    &metric_definition_hash(&MetricDefinition::CompletedPlannedTasks)
                        .expect("fixed definition hash"),
                ),
            ],
        ),
        object(
            "criterion-progress",
            "acceptanceCriterion",
            "Completion arithmetic retains traceable source inputs",
            Some("thing-progress"),
            &[],
        ),
        object(
            "assay-progress",
            "assay",
            "Synthetic completion arithmetic assay",
            Some("thing-progress"),
            &[("definitionHash", "synthetic-progress-assay@1")],
        ),
        object(
            "criterion-planning",
            "acceptanceCriterion",
            "Plans use declared calendar availability",
            Some("thing-planning"),
            &[],
        ),
        object(
            "assay-planning",
            "assay",
            "Synthetic availability-to-plan assay",
            Some("thing-planning"),
            &[("definitionHash", "synthetic-planning-assay@1")],
        ),
    ]);
    for number in 1..=6 {
        let task_id = format!("task-{number}");
        let plan_id = format!("plan-task-{number}");
        model.objects.push(object(
            &task_id,
            "task",
            &format!("Synthetic task {number}"),
            Some("thing-planning"),
            &[],
        ));
        model.objects.push(object(
            &plan_id,
            "planItem",
            &format!("Planned task {number}"),
            Some("thing-planning"),
            &[
                ("taskId", &task_id),
                ("plannedAt", WINDOW_START),
                ("status", if number == 6 { "cancelled" } else { "planned" }),
            ],
        ));
        model.relations.push(relation(
            &format!("lineage-task-{number}"),
            "dependsOn",
            METRIC_ID,
            &task_id,
        ));
        model.relations.push(relation(
            &format!("lineage-plan-{number}"),
            "dependsOn",
            METRIC_ID,
            &plan_id,
        ));
        model.relations.push(relation(
            &format!("plan-week-{number}"),
            "dependsOn",
            &plan_id,
            "weekly-plan",
        ));
        model.relations.push(relation(
            &format!("task-plan-{number}"),
            "dependsOn",
            &task_id,
            &plan_id,
        ));
        if number <= 3 {
            let observation_id = format!("completion-task-{number}");
            model.objects.push(object(
                &observation_id,
                "completionObservation",
                &format!("Synthetic completion {number}"),
                Some("thing-progress"),
                &[
                    ("taskId", &task_id),
                    ("completedAt", "2026-10-07T12:00:00Z"),
                ],
            ));
            model.relations.push(relation(
                &format!("lineage-completion-{number}"),
                "dependsOn",
                METRIC_ID,
                &observation_id,
            ));
        }
    }
    model.relations.extend([
        relation(
            "adapter-external",
            "dependsOn",
            "calendar-1",
            "external-calendar",
        ),
        relation(
            "availability-adapter",
            "dependsOn",
            "availability-calendar",
            "calendar-1",
        ),
        relation(
            "scheduling-availability",
            "dependsOn",
            "scheduling",
            "availability-calendar",
        ),
        relation("week-scheduling", "dependsOn", "weekly-plan", "scheduling"),
        relation(
            "block-week",
            "dependsOn",
            "block-french-tuesday",
            "weekly-plan",
        ),
        relation("metric-definition", "dependsOn", METRIC_ID, DEFINITION_ID),
        relation("review-metric", "dependsOn", "progress-review", METRIC_ID),
        relation(
            "interface-review",
            "dependsOn",
            "interface-1",
            "progress-review",
        ),
        relation("progress-coverage", "covers", "assay-progress", METRIC_ID),
        relation(
            "progress-verification",
            "verifiedBy",
            "criterion-progress",
            "assay-progress",
        ),
        relation(
            "planning-coverage",
            "covers",
            "assay-planning",
            "weekly-plan",
        ),
        relation(
            "planning-verification",
            "verifiedBy",
            "criterion-planning",
            "assay-planning",
        ),
        relation("calendar-coverage", "covers", "assay-1", "calendar-1"),
    ]);
    for edge in &mut model.relations {
        edge.source = synthetic_source(&edge.id);
    }
    for thing in &mut model.things {
        thing.source = synthetic_source(&thing.id);
    }
    for scope in &mut model.completeness {
        scope.source = synthetic_source(&scope.scope_id);
    }
    for scope in [
        IMPACT_DEPENDENCY_SCOPE,
        IMPACT_CRITERION_SCOPE,
        IMPACT_METRIC_SCOPE,
    ] {
        model.completeness.push(CompletenessDeclaration {
            scope_id: scope.into(),
            status: CompletenessStatus::Complete,
            source: synthetic_source(scope),
        });
    }
    let new_kinds = [
        "capability",
        "metricDefinition",
        "metric",
        "planItem",
        "completionObservation",
    ];
    for kind in new_kinds {
        model.template.object_shapes.push(ObjectShape {
            id: format!("shape:{kind}@1"),
            kind: kind.into(),
            required_properties: vec![],
        });
    }
    let functional_kinds: Vec<String> = [
        "task",
        "planItem",
        "completionObservation",
        "metric",
        "metricDefinition",
        "interface",
        "service",
        "adapter",
        "store",
        "operation",
        "calendarBlock",
        "goal",
        "outcome",
        "indicator",
        "capability",
    ]
    .iter()
    .map(|kind| (*kind).into())
    .collect();
    model
        .template
        .allowed_relation_endpoints
        .retain(|endpoint| endpoint.relation_kind != "dependsOn");
    model.template.allowed_relation_endpoints.extend([
        RelationEndpoint {
            relation_kind: "dependsOn".into(),
            from_kinds: functional_kinds.clone(),
            to_kinds: functional_kinds.clone(),
        },
        RelationEndpoint {
            relation_kind: "covers".into(),
            from_kinds: vec!["assay".into()],
            to_kinds: functional_kinds,
        },
    ]);
    let pack = RulePackPin {
        id: ASSISTANT_IMPACT_PACK_ID.into(),
        version: ASSISTANT_IMPACT_PACK_VERSION.into(),
    };
    model.rule_packs.push(pack.clone());
    model.template.required_rule_packs.push(pack);
    model
}

/// # Panics
/// Panics only if the compiled synthetic fixture is internally inconsistent.
#[must_use]
pub fn snapshot(id: &str) -> Option<WorldSnapshot> {
    if !ids().contains(&id) {
        return None;
    }
    let mut model = base();
    model.revision_id = id.into();
    match id {
        "assistant-impact-calendar-adapter" => {
            model
                .things
                .iter_mut()
                .find(|thing| thing.id == "thing-calendar-adapter")
                .expect("adapter Thing")
                .revision_id = "calendar-adapter@2".into();
        }
        "assistant-impact-completion" => model
            .objects
            .iter_mut()
            .find(|object| object.id == "completion-task-3")
            .expect("completion")
            .properties
            .insert("completedAt".into(), "2026-10-12T00:00:00Z".into())
            .map_or((), |_| ()),
        "assistant-impact-interface" => model
            .objects
            .iter_mut()
            .find(|object| object.id == "interface-1")
            .expect("interface")
            .properties
            .insert("statement".into(), "Compact progress review layout".into())
            .map_or((), |_| ()),
        "assistant-impact-removed-dependency" => model
            .relations
            .retain(|edge| edge.id != "scheduling-availability"),
        "assistant-impact-metric-definition" => {
            let definition = MetricDefinition::CompletedPlannedTasksIncludingCancelled;
            for node in model
                .objects
                .iter_mut()
                .filter(|node| node.id == METRIC_ID || node.id == DEFINITION_ID)
            {
                node.properties.insert(
                    "metricDefinition".into(),
                    definition_name(&definition).into(),
                );
            }
            model
                .objects
                .iter_mut()
                .find(|node| node.id == METRIC_ID)
                .expect("metric")
                .properties
                .insert(
                    "definitionHash".into(),
                    metric_definition_hash(&definition).expect("fixed definition hash"),
                );
        }
        "assistant-impact-incomplete" => {
            for scope in &mut model.completeness {
                if [
                    IMPACT_METRIC_SCOPE,
                    IMPACT_DEPENDENCY_SCOPE,
                    IMPACT_CRITERION_SCOPE,
                ]
                .contains(&scope.scope_id.as_str())
                {
                    scope.status = CompletenessStatus::Incomplete;
                }
            }
        }
        _ => {}
    }
    Some(model)
}

fn invalid(message: impl Into<String>) -> CoreError {
    CoreError::Evaluation(message.into())
}
fn property<'a>(object: &'a ModelObject, key: &str) -> Result<&'a str, CoreError> {
    object
        .properties
        .get(key)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid(format!("{} missing {key}", object.id)))
}
fn parse_definition(value: &str) -> Result<MetricDefinition, CoreError> {
    match value {
        "completedPlannedTasks" => Ok(MetricDefinition::CompletedPlannedTasks),
        "completedPlannedTasksIncludingCancelled" => {
            Ok(MetricDefinition::CompletedPlannedTasksIncludingCancelled)
        }
        _ => Err(invalid("unsupported fixed metric definition")),
    }
}

/// Validates the canonical second-precision UTC fixture timestamp format.
/// # Errors
/// Rejects invalid calendar dates, local offsets, and noncanonical timestamps.
pub fn validate_utc(value: &str) -> Result<(), CoreError> {
    let bytes = value.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| ![4, 7, 10, 13, 16, 19].contains(&index) && !byte.is_ascii_digit())
    {
        return Err(invalid("timestamp must be YYYY-MM-DDTHH:MM:SSZ"));
    }
    let part = |start, end| {
        value[start..end]
            .parse::<u32>()
            .map_err(|_| invalid("invalid timestamp"))
    };
    let year = part(0, 4)?;
    let month = part(5, 7)?;
    let day = part(8, 10)?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    if year == 0
        || day == 0
        || day > days
        || part(11, 13)? > 23
        || part(14, 16)? > 59
        || part(17, 19)? > 59
    {
        return Err(invalid("invalid UTC calendar timestamp"));
    }
    Ok(())
}

fn bound(object: &ModelObject) -> Result<BoundObjectInput, CoreError> {
    Ok(BoundObjectInput {
        object_id: object.id.clone(),
        digest: content_hash(object)?,
    })
}
fn established(source: &Source) -> bool {
    matches!(source.kind, SourceKind::Declared | SourceKind::Observation)
}

fn in_window(timestamp: &str, window: &ReportingWindow) -> bool {
    timestamp >= window.start_utc.as_str() && timestamp < window.end_utc.as_str()
}

/// Projects only fixed typed metric inputs; numeric property claims are ignored.
/// # Errors
/// Rejects malformed identities, timestamps, definitions, and conflicting duplicates.
#[allow(clippy::too_many_lines)]
pub fn assess_metrics(snapshot: &WorldSnapshot) -> Result<Vec<MetricAssessment>, CoreError> {
    if snapshot.objects.len() > MAX_OBJECTS || snapshot.relations.len() > MAX_RELATIONS {
        return Err(CoreError::ResourceLimit(
            "metric projection input limit exceeded".into(),
        ));
    }
    let mut index = BTreeMap::new();
    for node in &snapshot.objects {
        if index.insert(node.id.as_str(), node).is_some() {
            return Err(invalid("duplicate object identity in metric projection"));
        }
    }
    let mut plans: BTreeMap<String, PlanItem> = BTreeMap::new();
    let mut completions: BTreeMap<String, CompletionObservation> = BTreeMap::new();
    let mut inputs = vec![];
    let mut referenced_tasks = BTreeSet::new();
    for node in snapshot
        .objects
        .iter()
        .filter(|node| node.kind == "planItem" || node.kind == "completionObservation")
    {
        let task_id = property(node, "taskId")?;
        if index.get(task_id).is_none_or(|task| task.kind != "task") {
            return Err(invalid(format!("{} taskId must reference a task", node.id)));
        }
        inputs.push(bound(node)?);
        referenced_tasks.insert(task_id);
        if node.kind == "planItem" {
            let timestamp = property(node, "plannedAt")?;
            validate_utc(timestamp)?;
            let status = match property(node, "status")? {
                "planned" => PlanItemStatus::Planned,
                "cancelled" => PlanItemStatus::Cancelled,
                _ => return Err(invalid("invalid plan item status")),
            };
            let item = PlanItem {
                object_id: node.id.clone(),
                task_id: task_id.into(),
                planned_at_utc: timestamp.into(),
                status,
                input_digest: content_hash(node)?,
            };
            if let Some(previous) = plans.get(task_id) {
                if previous.planned_at_utc != item.planned_at_utc || previous.status != item.status
                {
                    return Err(invalid(format!("conflicting plan items for {task_id}")));
                }
            } else {
                plans.insert(task_id.into(), item);
            }
        } else {
            let timestamp = property(node, "completedAt")?;
            validate_utc(timestamp)?;
            let observation = CompletionObservation {
                object_id: node.id.clone(),
                task_id: task_id.into(),
                completed_at_utc: timestamp.into(),
                input_digest: content_hash(node)?,
            };
            if let Some(previous) = completions.get(task_id) {
                if previous.completed_at_utc != observation.completed_at_utc {
                    return Err(invalid(format!(
                        "conflicting completion observations for {task_id}"
                    )));
                }
            } else {
                completions.insert(task_id.into(), observation);
            }
        }
    }
    for task_id in referenced_tasks {
        inputs.push(bound(index[task_id])?);
    }
    let mut result = vec![];
    for metric in snapshot.objects.iter().filter(|node| node.kind == "metric") {
        let definition = parse_definition(property(metric, "metricDefinition")?)?;
        let window = ReportingWindow {
            start_utc: property(metric, "windowStart")?.into(),
            end_utc: property(metric, "windowEnd")?.into(),
        };
        validate_utc(&window.start_utc)?;
        validate_utc(&window.end_utc)?;
        if window.start_utc >= window.end_utc {
            return Err(invalid(
                "metric reporting window must have positive duration",
            ));
        }
        if property(metric, "unit")? != "ratio" {
            return Err(invalid("fixed metric unit must be ratio"));
        }
        let definition_hash = metric_definition_hash(&definition)?;
        if property(metric, "definitionHash")? != definition_hash {
            return Err(invalid(
                "metric definition digest does not match fixed definition",
            ));
        }
        let definitions: Vec<_> = snapshot
            .relations
            .iter()
            .filter(|edge| edge.kind == "dependsOn" && edge.from_id == metric.id)
            .filter_map(|edge| index.get(edge.to_id.as_str()).copied())
            .filter(|node| node.kind == "metricDefinition")
            .collect();
        if definitions.len() != 1 {
            return Err(invalid(
                "metric requires exactly one definition lineage object",
            ));
        }
        let definition_object = definitions[0];
        if parse_definition(property(definition_object, "metricDefinition")?)? != definition
            || property(definition_object, "unit")? != "ratio"
        {
            return Err(invalid("metric and lineage definition disagree"));
        }
        let mut refs = inputs.clone();
        refs.extend([bound(metric)?, bound(definition_object)?]);
        refs.sort_by(|a, b| a.object_id.cmp(&b.object_id));
        let linked_established = |object_id: &str| {
            snapshot.relations.iter().any(|edge| {
                edge.kind == "dependsOn"
                    && edge.from_id == metric.id
                    && edge.to_id == object_id
                    && established(&edge.source)
            })
        };
        let definition_established = established(&metric.source)
            && established(&definition_object.source)
            && linked_established(&definition_object.id);
        // Counts are partial facts only. Unresolved records or memberships do not
        // contribute, and unresolved definitions cannot establish eligibility.
        let established_tasks = |kind: &str| -> BTreeSet<String> {
            snapshot
                .objects
                .iter()
                .filter(|node| {
                    node.kind == kind && established(&node.source) && linked_established(&node.id)
                })
                .filter_map(|node| node.properties.get("taskId").cloned())
                .filter(|task_id| {
                    index
                        .get(task_id.as_str())
                        .is_some_and(|task| established(&task.source))
                        && linked_established(task_id)
                })
                .collect()
        };
        let established_plan_tasks = established_tasks("planItem");
        let established_completion_tasks = established_tasks("completionObservation");
        let eligible: Vec<_> = plans
            .values()
            .filter(|item| {
                definition_established
                    && established_plan_tasks.contains(&item.task_id)
                    && in_window(&item.planned_at_utc, &window)
                    && (item.status == PlanItemStatus::Planned
                        || definition == MetricDefinition::CompletedPlannedTasksIncludingCancelled)
            })
            .collect();
        let planned_count =
            u32::try_from(eligible.len()).map_err(|_| invalid("metric count overflow"))?;
        let completed_count = u32::try_from(
            eligible
                .iter()
                .filter(|item| {
                    established_completion_tasks.contains(&item.task_id)
                        && completions.get(&item.task_id).is_some_and(|observation| {
                            in_window(&observation.completed_at_utc, &window)
                        })
                })
                .count(),
        )
        .map_err(|_| invalid("metric count overflow"))?;
        let scope: Vec<_> = snapshot
            .completeness
            .iter()
            .filter(|scope| scope.scope_id == IMPACT_METRIC_SCOPE)
            .collect();
        let mut diagnostics =
            vec!["Synthetic sample arithmetic; not observed outcome proof.".into()];
        let coverage_complete = scope.len() == 1
            && scope[0].status == CompletenessStatus::Complete
            && established(&scope[0].source);
        let provenance_complete = established(&metric.source)
            && established(&definition_object.source)
            && inputs.iter().all(|input| {
                index
                    .get(input.object_id.as_str())
                    .is_some_and(|node| established(&node.source))
            });
        let lineage_complete = linked_established(&definition_object.id)
            && inputs
                .iter()
                .all(|input| linked_established(&input.object_id))
            && snapshot
                .relations
                .iter()
                .filter(|edge| edge.kind == "dependsOn" && edge.from_id == metric.id)
                .all(|edge| established(&edge.source));
        if !coverage_complete {
            diagnostics.push("Completion and plan input coverage is missing, incomplete, or has unresolved provenance; counts are partial records only.".into());
        }
        if !provenance_complete {
            diagnostics.push("Metric input or definition provenance is not established; unresolved records are excluded from partial counts.".into());
        }
        if !lineage_complete {
            diagnostics.push("Metric input lineage is missing or has unresolved provenance; counts include only established memberships.".into());
        }
        if planned_count == 0 {
            diagnostics.push("No established eligible planned tasks in reporting window.".into());
        }
        let known =
            coverage_complete && provenance_complete && lineage_complete && planned_count > 0;
        result.push(MetricAssessment {
            metric_id: metric.id.clone(),
            definition,
            definition_hash,
            window,
            status: if known {
                MetricStatus::Known
            } else {
                MetricStatus::Unknown
            },
            completed_count,
            planned_count,
            value: known.then(|| f64::from(completed_count) / f64::from(planned_count)),
            input_refs: refs,
            diagnostics,
        });
    }
    result.sort_by(|a, b| a.metric_id.cmp(&b.metric_id));
    Ok(result)
}

/// Compares matching fixed metrics and suppresses deltas when definitions or windows differ.
/// # Errors
/// Returns typed projection errors from either snapshot.
pub fn evaluate_metrics(
    baseline: &WorldSnapshot,
    target: &WorldSnapshot,
) -> Result<Vec<MetricComparison>, CoreError> {
    let before: BTreeMap<_, _> = assess_metrics(baseline)?
        .into_iter()
        .map(|metric| (metric.metric_id.clone(), metric))
        .collect();
    let after: BTreeMap<_, _> = assess_metrics(target)?
        .into_iter()
        .map(|metric| (metric.metric_id.clone(), metric))
        .collect();
    let ids: BTreeSet<_> = before.keys().chain(after.keys()).cloned().collect();
    Ok(ids
        .into_iter()
        .map(|id| {
            let baseline = before.get(&id).cloned();
            let proposed = after.get(&id).cloned();
            let comparability = match (&baseline, &proposed) {
                (Some(before), Some(after)) if before.definition_hash != after.definition_hash => {
                    MetricComparability::DefinitionChanged
                }
                (Some(before), Some(after)) if before.window != after.window => {
                    MetricComparability::WindowChanged
                }
                (Some(before), Some(after))
                    if before.status == MetricStatus::Known
                        && after.status == MetricStatus::Known =>
                {
                    MetricComparability::Comparable
                }
                _ => MetricComparability::Unknown,
            };
            let delta = if comparability == MetricComparability::Comparable {
                baseline
                    .as_ref()
                    .and_then(|before| before.value)
                    .zip(proposed.as_ref().and_then(|after| after.value))
                    .map(|(before, after)| after - before)
            } else {
                None
            };
            MetricComparison {
                metric_id: id,
                baseline,
                proposed,
                comparability,
                delta,
            }
        })
        .collect())
}

/// Creates separately resolved synthetic evidence bindings for server fixture loading.
/// # Errors
/// Returns canonical digest serialization errors.
pub fn sample_evidence(snapshot: &WorldSnapshot) -> Result<Vec<EvidenceBinding>, CoreError> {
    if snapshot.objects.len() > MAX_OBJECTS || snapshot.relations.len() > MAX_RELATIONS {
        return Err(CoreError::ResourceLimit(
            "sample evidence input limit exceeded".into(),
        ));
    }
    snapshot
        .objects
        .iter()
        .filter(|node| node.kind == "assay")
        .map(|assay| {
            let covered: BTreeSet<_> = snapshot
                .relations
                .iter()
                .filter(|edge| edge.kind == "covers" && edge.from_id == assay.id)
                .map(|edge| edge.to_id.clone())
                .collect();
            let mut required = covered.clone();
            required.insert(assay.id.clone());
            // Bind the assay's functional object and all of its transitive dependency inputs.
            loop {
                let next: BTreeSet<_> = snapshot
                    .relations
                    .iter()
                    .filter(|edge| edge.kind == "dependsOn" && required.contains(&edge.from_id))
                    .map(|edge| edge.to_id.clone())
                    .collect();
                let length = required.len();
                required.extend(next);
                if length == required.len() {
                    break;
                }
            }
            let object_inputs = snapshot
                .objects
                .iter()
                .filter(|node| required.contains(&node.id))
                .map(bound)
                .collect::<Result<Vec<_>, _>>()?;
            let relation_inputs = snapshot
                .relations
                .iter()
                .filter(|edge| {
                    (edge.kind == "dependsOn" && required.contains(&edge.from_id))
                        || (edge.kind == "covers" && edge.from_id == assay.id)
                        || (edge.kind == "verifiedBy" && edge.to_id == assay.id)
                })
                .map(|edge| {
                    Ok(BoundRelationInput {
                        relation_id: edge.id.clone(),
                        digest: content_hash(edge)?,
                    })
                })
                .collect::<Result<Vec<_>, CoreError>>()?;
            let things: BTreeSet<_> = snapshot
                .objects
                .iter()
                .filter(|node| required.contains(&node.id))
                .filter_map(|node| node.thing_id.as_deref())
                .collect();
            let thing_revisions = snapshot
                .things
                .iter()
                .filter(|thing| things.contains(thing.id.as_str()))
                .map(|thing| BoundThingRevision {
                    thing_id: thing.id.clone(),
                    revision_id: thing.revision_id.clone(),
                })
                .collect();
            Ok(EvidenceBinding {
                evidence_id: format!("synthetic-evidence:{}", assay.id),
                assay_id: assay.id.clone(),
                assay_definition_hash: Some(content_hash(assay)?),
                object_inputs,
                relation_inputs,
                thing_revisions,
                rule_packs: snapshot.rule_packs.clone(),
                provenance: EvidenceProvenance::Synthetic,
            })
        })
        .collect()
}
