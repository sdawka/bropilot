use super::{
    CompletenessDeclaration, CompletenessStatus, Environment, ExternalReference, ForbiddenCycle,
    IncompatibleConstraint, ModelObject, ModelRelation, MoveSummary, ObjectShape, Purpose,
    RelationEndpoint, RequiredRelation, RulePackPin, Source, SourceKind, StateKind, Theory,
    TheoryClaim, Thing, ThingCapabilities, ThingTemplate, VersionRef, WorldSnapshot, WorldTemplate,
};
use std::collections::BTreeMap;

fn model_source(reference: &str) -> Source {
    Source {
        kind: SourceKind::Declared,
        reference: reference.into(),
    }
}

fn epistemic_source(kind: SourceKind, reference: &str) -> Source {
    Source {
        kind,
        reference: reference.into(),
    }
}

fn object(
    id: &str,
    kind: &str,
    title: &str,
    thing_id: Option<&str>,
    parent_id: Option<&str>,
) -> ModelObject {
    ModelObject {
        id: id.into(),
        kind: kind.into(),
        title: title.into(),
        thing_id: thing_id.map(str::to_owned),
        parent_id: parent_id.map(str::to_owned),
        properties: BTreeMap::new(),
        source: model_source(&format!("fixture:{id}")),
    }
}

fn relation(id: &str, kind: &str, from_id: &str, to_id: &str) -> ModelRelation {
    ModelRelation {
        id: id.into(),
        kind: kind.into(),
        from_id: from_id.into(),
        to_id: to_id.into(),
        source: model_source(&format!("fixture:{id}")),
    }
}

#[allow(clippy::too_many_lines)]
fn base() -> WorldSnapshot {
    let shape_kinds = [
        "world",
        "beneficiary",
        "environment",
        "outcome",
        "indicator",
        "evaluationPlan",
        "interface",
        "service",
        "adapter",
        "store",
        "operation",
        "authorizationRule",
        "acceptanceCriterion",
        "assay",
        "thing",
        "subsystem",
        "goal",
        "task",
        "calendarBlock",
        "schedulingConflict",
    ];
    let endpoint = |relation_kind: &str, from_kinds: &[&str], to_kinds: &[&str]| RelationEndpoint {
        relation_kind: relation_kind.into(),
        from_kinds: from_kinds.iter().map(|value| (*value).into()).collect(),
        to_kinds: to_kinds.iter().map(|value| (*value).into()).collect(),
    };
    let required = |rule_id: &str,
                    subject_kind: &str,
                    relation_kind: &str,
                    object_kind: &str,
                    scope_id: &str| RequiredRelation {
        rule_id: rule_id.into(),
        subject_kind: subject_kind.into(),
        relation_kind: relation_kind.into(),
        object_kind: object_kind.into(),
        scope_id: scope_id.into(),
    };
    WorldSnapshot {
        world_id: "assistant-world".into(),
        title: "Personal assistant World".into(),
        revision_id: "assistant-valid".into(),
        template: WorldTemplate {
            id: "assistant-world".into(),
            version: "1".into(),
            object_shapes: shape_kinds
                .iter()
                .map(|kind| ObjectShape {
                    id: format!("shape:{kind}@1"),
                    kind: (*kind).into(),
                    required_properties: Vec::new(),
                })
                .collect(),
            allowed_relation_endpoints: vec![
                endpoint("hasBeneficiary", &["world"], &["beneficiary"]),
                endpoint("hasOutcome", &["world"], &["outcome"]),
                endpoint("measuredBy", &["outcome"], &["indicator"]),
                endpoint("evaluatedBy", &["outcome"], &["evaluationPlan"]),
                endpoint("authorizedBy", &["operation"], &["authorizationRule"]),
                endpoint("verifiedBy", &["acceptanceCriterion"], &["assay"]),
                endpoint("dependsOn", &["service", "adapter", "store"], &["service", "adapter", "store"]),
            ],
            required_relations: vec![
                required("assistant.purpose-requires-beneficiary", "world", "hasBeneficiary", "beneficiary", "purpose-links"),
                required("assistant.purpose-requires-outcome", "world", "hasOutcome", "outcome", "purpose-links"),
                required("assistant.outcome-requires-indicator", "outcome", "measuredBy", "indicator", "outcome-links"),
                required("assistant.outcome-requires-evaluation", "outcome", "evaluatedBy", "evaluationPlan", "outcome-links"),
                required("assistant.operation-requires-authorization", "operation", "authorizedBy", "authorizationRule", "authorization-links"),
                required("assistant.criterion-requires-assay", "acceptanceCriterion", "verifiedBy", "assay", "assay-links"),
            ],
            forbidden_cycles: vec![ForbiddenCycle {
                rule_id: "assistant.no-dependency-cycles".into(),
                relation_kinds: vec!["dependsOn".into()],
            }],
            incompatible_constraints: vec![IncompatibleConstraint {
                rule_id: "assistant.constraints-compatible".into(),
                left: "routine-auto".into(),
                right: "manual-only".into(),
            }],
            required_rule_packs: vec![
                RulePackPin {
                    id: "core-foundation".into(),
                    version: "1".into(),
                },
                RulePackPin {
                    id: "assistant-foundation".into(),
                    version: "1".into(),
                },
            ],
        },
        purpose: Purpose {
            statement: "Improve the user's life by organizing goals, tasks, calendar blocks and progress review.".into(),
            beneficiary_ids: vec!["user".into()],
            outcome_ids: vec!["outcome-1".into()],
        },
        environment: Environment {
            id: "assistant-environment".into(),
            title: "Disconnected personal assistant environment model".into(),
        },
        phase: "foundation".into(),
        state_kind: StateKind::Desired,
        things: vec![
            Thing { id: "thing-interface".into(), kind: "interface".into(), title: "Assistant interface".into(), revision_id: "interface@1".into(), template_ref: VersionRef { id: "managed-interface".into(), version: "1".into() }, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true }, external_reference: None, source: model_source("fixture:thing-interface") },
            Thing { id: "thing-planning".into(), kind: "service".into(), title: "Planning service".into(), revision_id: "planning@1".into(), template_ref: VersionRef { id: "managed-service".into(), version: "1".into() }, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true }, external_reference: None, source: model_source("fixture:thing-planning") },
            Thing { id: "thing-calendar".into(), kind: "externalCalendar".into(), title: "External calendar".into(), revision_id: "calendar-model@1".into(), template_ref: VersionRef { id: "external-calendar".into(), version: "1".into() }, capabilities: ThingCapabilities { external: true, forkable: false, observable: true, reversible: true }, external_reference: Some(ExternalReference { system: "calendar-provider-unselected".into(), connection_status: "disconnected".into() }), source: model_source("fixture:thing-calendar") },
            Thing { id: "thing-progress".into(), kind: "store".into(), title: "Progress and context store".into(), revision_id: "progress@1".into(), template_ref: VersionRef { id: "managed-store".into(), version: "1".into() }, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true }, external_reference: None, source: model_source("fixture:thing-progress") },
        ],
        thing_templates: vec![
            ThingTemplate { id: "managed-interface".into(), version: "1".into(), title: "Managed interface".into(), compatible_world_templates: vec![VersionRef { id: "assistant-world".into(), version: "1".into() }], inherits_world_context: true, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true } },
            ThingTemplate { id: "managed-service".into(), version: "1".into(), title: "Managed service".into(), compatible_world_templates: vec![VersionRef { id: "assistant-world".into(), version: "1".into() }], inherits_world_context: true, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true } },
            ThingTemplate { id: "external-calendar".into(), version: "1".into(), title: "External calendar model".into(), compatible_world_templates: vec![VersionRef { id: "assistant-world".into(), version: "1".into() }], inherits_world_context: true, capabilities: ThingCapabilities { external: true, forkable: false, observable: true, reversible: true } },
            ThingTemplate { id: "managed-store".into(), version: "1".into(), title: "Managed store".into(), compatible_world_templates: vec![VersionRef { id: "assistant-world".into(), version: "1".into() }], inherits_world_context: true, capabilities: ThingCapabilities { external: false, forkable: true, observable: true, reversible: true } },
        ],
        objects: vec![
            object("assistant-world", "world", "Personal assistant", None, None),
            object("assistant-environment", "environment", "Disconnected assistant environment model", None, Some("assistant-world")),
            object("user", "beneficiary", "User", None, Some("assistant-world")),
            object("outcome-1", "outcome", "Goals reliably become reviewed calendar work", None, Some("assistant-world")),
            object("indicator-1", "indicator", "Planned work completion trend", None, Some("outcome-1")),
            object("evaluation-1", "evaluationPlan", "Review progress against planned work", None, Some("outcome-1")),
            object("node-thing-interface", "thing", "Assistant interface", Some("thing-interface"), Some("assistant-world")),
            object("node-thing-planning", "thing", "Planning service", Some("thing-planning"), Some("assistant-world")),
            object("node-thing-calendar", "thing", "External calendar", Some("thing-calendar"), Some("assistant-world")),
            object("node-thing-progress", "thing", "Progress and context store", Some("thing-progress"), Some("assistant-world")),
            object("interface-1", "interface", "Assistant interface", Some("thing-interface"), Some("node-thing-interface")),
            object("planning-1", "service", "Planning service", Some("thing-planning"), Some("node-thing-planning")),
            object("calendar-1", "adapter", "Disconnected calendar adapter model", Some("thing-calendar"), Some("node-thing-calendar")),
            object("progress-1", "store", "Progress store", Some("thing-progress"), Some("node-thing-progress")),
            object("subsystem-planning", "subsystem", "Goal-to-calendar planning", Some("thing-planning"), Some("node-thing-planning")),
            object("operation-plan", "operation", "Plan assistant-owned calendar block", Some("thing-planning"), Some("subsystem-planning")),
            object("auth-routine", "authorizationRule", "Routine assistant-owned blocks only", Some("thing-planning"), Some("operation-plan")),
            object("criterion-1", "acceptanceCriterion", "Calendar changes respect routine policy", Some("thing-calendar"), Some("calendar-1")),
            object("assay-1", "assay", "Routine calendar policy assay", Some("thing-calendar"), Some("criterion-1")),
            object("goal-french", "goal", "Build a sustainable French practice", None, Some("assistant-world")),
            object("task-french-listening", "task", "Complete a focused French listening session", None, Some("goal-french")),
            {
                let mut block = object("block-french-tuesday", "calendarBlock", "French listening session — Tuesday", Some("thing-calendar"), Some("task-french-listening"));
                block.properties.insert("connectionStatus".into(), "disconnected".into());
                block.properties.insert("durationMinutes".into(), "30".into());
                block.properties.insert("ownership".into(), "assistant".into());
                block
            },
        ],
        relations: vec![
            relation("rel-beneficiary", "hasBeneficiary", "assistant-world", "user"),
            relation("rel-outcome", "hasOutcome", "assistant-world", "outcome-1"),
            relation("rel-indicator", "measuredBy", "outcome-1", "indicator-1"),
            relation("rel-evaluation", "evaluatedBy", "outcome-1", "evaluation-1"),
            relation("rel-auth", "authorizedBy", "operation-plan", "auth-routine"),
            relation("rel-assay", "verifiedBy", "criterion-1", "assay-1"),
            relation("rel-plan-calendar", "dependsOn", "planning-1", "calendar-1"),
            relation("rel-plan-progress", "dependsOn", "planning-1", "progress-1"),
        ],
        completeness: ["purpose-links", "outcome-links", "authorization-links", "assay-links"]
            .iter()
            .map(|scope_id| CompletenessDeclaration {
                scope_id: (*scope_id).into(),
                status: CompletenessStatus::Complete,
                source: model_source(&format!("fixture:scope:{scope_id}")),
            })
            .collect(),
        theory: Theory {
            claims: vec![TheoryClaim {
                id: "claim-1".into(),
                title: "Connecting goals to reviewed calendar work supports follow-through".into(),
                outcome_id: "outcome-1".into(),
                indicator_ids: vec!["indicator-1".into()],
                evaluation_ids: vec!["evaluation-1".into()],
                source: epistemic_source(SourceKind::Hypothesis, "fixture:claim-1"),
            }],
        },
        moves: vec![MoveSummary {
            id: "move-1".into(),
            title: "Establish the assistant foundation".into(),
            base_revision_id: "assistant-valid".into(),
            status: "planned".into(),
        }],
        rule_packs: vec![
            RulePackPin { id: "core-foundation".into(), version: "1".into() },
            RulePackPin { id: "assistant-foundation".into(), version: "1".into() },
        ],
        active_constraints: vec!["routine-auto".into()],
    }
}

#[must_use]
pub fn snapshot(id: &str) -> Option<WorldSnapshot> {
    let mut snapshot = base();
    snapshot.revision_id = id.into();
    match id {
        "assistant-valid" => {}
        "assistant-missing" => {
            snapshot
                .relations
                .retain(|relation| relation.id != "rel-evaluation");
        }
        "assistant-conflict" => {
            snapshot.relations.push(relation(
                "rel-calendar-plan",
                "dependsOn",
                "calendar-1",
                "planning-1",
            ));
            snapshot.active_constraints.push("manual-only".into());
            let mut conflict = object(
                "calendar-conflict-1",
                "schedulingConflict",
                "Assumed overlap with French listening session",
                Some("thing-calendar"),
                Some("block-french-tuesday"),
            );
            conflict.source = epistemic_source(
                SourceKind::Assumption,
                "fixture:calendar-conflict-1:not-observed",
            );
            conflict
                .properties
                .insert("calendarStatus".into(), "disconnected".into());
            conflict
                .properties
                .insert("conflictsWith".into(), "unverified-external-event".into());
            snapshot.objects.push(conflict);
        }
        "assistant-unknown" => {
            snapshot
                .relations
                .retain(|relation| relation.id != "rel-evaluation");
            let declaration = snapshot
                .completeness
                .iter_mut()
                .find(|declaration| declaration.scope_id == "outcome-links")?;
            declaration.status = CompletenessStatus::Incomplete;
        }
        _ => return None,
    }
    Some(snapshot)
}

#[must_use]
pub fn ids() -> &'static [&'static str] {
    &[
        "assistant-valid",
        "assistant-missing",
        "assistant-conflict",
        "assistant-unknown",
    ]
}
