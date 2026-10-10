//! Advisory change-impact wire contracts. Applicability is never verifier acceptance.
use super::{Deserialize, RulePackPin, Serialize, TS, WorldSnapshot};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ImpactOrigin {
    Saved,
    Hypothetical,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ImpactSide {
    Baseline,
    Proposed,
    Both,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ImpactChangeKind {
    Added,
    Removed,
    Modified,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ImpactEntityKind {
    Thing,
    Object,
    Relation,
    Context,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum EvidenceApplicability {
    InputsMatch,
    NeedsRecheck,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum EvidenceProvenance {
    Synthetic,
    Unverified,
    ServerResolved,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum MetricStatus {
    Known,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum MetricComparability {
    Comparable,
    DefinitionChanged,
    WindowChanged,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum MetricDefinition {
    CompletedPlannedTasks,
    CompletedPlannedTasksIncludingCancelled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum PlanItemStatus {
    Planned,
    Cancelled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ImpactProperty {
    Status,
    PlannedAt,
    CompletedAt,
    TaskId,
    MetricDefinition,
    WindowStart,
    WindowEnd,
    Statement,
    DefinitionHash,
}

wire_type!(
    pub struct SnapshotIdentity {
        pub world_id: String,
        pub revision_id: String,
        pub snapshot_hash: String,
    }
);

wire_type!(
    pub struct ImpactChange {
        pub id: String,
        pub entity_kind: ImpactEntityKind,
        pub change_kind: ImpactChangeKind,
        pub title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub thing_id: Option<String>,
        pub changed_fields: Vec<String>,
    }
);

wire_type!(
    pub struct ImpactWitness {
        pub seed_id: String,
        pub side: ImpactSide,
        pub rule_id: String,
        pub object_ids: Vec<String>,
        pub relation_ids: Vec<String>,
    }
);

wire_type!(
    pub struct AffectedObject {
        pub object_id: String,
        pub title: String,
        pub kind: String,
        pub side: ImpactSide,
        pub direct: bool,
        pub witnesses: Vec<ImpactWitness>,
    }
);

wire_type!(
    pub struct ThingImpact {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub thing_id: Option<String>,
        pub title: String,
        pub objects: Vec<AffectedObject>,
    }
);

wire_type!(
    pub struct ImpactDiagnostic {
        pub code: String,
        pub message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub scope_id: Option<String>,
        pub side: ImpactSide,
        pub object_ids: Vec<String>,
    }
);

wire_type!(
    pub struct BoundObjectInput {
        pub object_id: String,
        pub digest: String,
    }
);

wire_type!(
    pub struct BoundRelationInput {
        pub relation_id: String,
        pub digest: String,
    }
);

wire_type!(
    pub struct BoundThingRevision {
        pub thing_id: String,
        pub revision_id: String,
    }
);

wire_type!(
    pub struct EvidenceBinding {
        pub evidence_id: String,
        pub assay_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub assay_definition_hash: Option<String>,
        pub object_inputs: Vec<BoundObjectInput>,
        #[serde(default)]
        pub relation_inputs: Vec<BoundRelationInput>,
        pub thing_revisions: Vec<BoundThingRevision>,
        pub rule_packs: Vec<RulePackPin>,
        pub provenance: EvidenceProvenance,
    }
);

wire_type!(
    pub struct EvidenceImpact {
        pub evidence_id: String,
        pub assay_id: String,
        pub applicability: EvidenceApplicability,
        pub provenance: EvidenceProvenance,
        pub reasons: Vec<String>,
        pub object_ids: Vec<String>,
    }
);

wire_type!(
    pub struct CriterionImpact {
        pub criterion_id: String,
        pub assay_ids: Vec<String>,
        pub side: ImpactSide,
        pub witnesses: Vec<ImpactWitness>,
    }
);

wire_type!(
    pub struct ReportingWindow {
        pub start_utc: String,
        pub end_utc: String,
    }
);

wire_type!(
    pub struct PlanItem {
        pub object_id: String,
        pub task_id: String,
        pub planned_at_utc: String,
        pub status: PlanItemStatus,
        pub input_digest: String,
    }
);

wire_type!(
    pub struct CompletionObservation {
        pub object_id: String,
        pub task_id: String,
        pub completed_at_utc: String,
        pub input_digest: String,
    }
);

wire_type!(
    pub struct MetricAssessment {
        pub metric_id: String,
        pub definition: MetricDefinition,
        pub definition_hash: String,
        pub window: ReportingWindow,
        pub status: MetricStatus,
        pub completed_count: u32,
        pub planned_count: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        /// Ratio in [0, 1]; consumers may format as a percentage.
        pub value: Option<f64>,
        pub input_refs: Vec<BoundObjectInput>,
        pub diagnostics: Vec<String>,
    }
);

wire_type!(
    pub struct MetricComparison {
        pub metric_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub baseline: Option<MetricAssessment>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub proposed: Option<MetricAssessment>,
        pub comparability: MetricComparability,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        /// Proposed minus baseline ratio, only when comparable.
        pub delta: Option<f64>,
    }
);

wire_type!(
    pub struct ImpactAnalysisContext {
        pub origin: ImpactOrigin,
        pub evidence_bindings: Vec<EvidenceBinding>,
    }
);

wire_type!(
    pub struct ChangeImpactReport {
        pub baseline: SnapshotIdentity,
        pub target: SnapshotIdentity,
        pub origin: ImpactOrigin,
        pub rule_packs: Vec<RulePackPin>,
        pub changes: Vec<ImpactChange>,
        pub affected_things: Vec<ThingImpact>,
        pub criteria: Vec<CriterionImpact>,
        pub assays: Vec<AffectedObject>,
        pub metrics: Vec<MetricComparison>,
        pub evidence: Vec<EvidenceImpact>,
        pub diagnostics: Vec<ImpactDiagnostic>,
        pub complete: bool,
    }
);

/// Only these typed edits are admitted. Validation and application live in core.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum ImpactPatchOperation {
    SetThingRevision {
        #[serde(rename = "thingId")]
        #[ts(rename = "thingId")]
        thing_id: String,
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
    },
    SetProperty {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        property: ImpactProperty,
        value: String,
    },
    AddDependency {
        #[serde(rename = "relationId")]
        #[ts(rename = "relationId")]
        relation_id: String,
        #[serde(rename = "dependentId")]
        #[ts(rename = "dependentId")]
        dependent_id: String,
        #[serde(rename = "dependencyId")]
        #[ts(rename = "dependencyId")]
        dependency_id: String,
    },
    RemoveDependency {
        #[serde(rename = "relationId")]
        #[ts(rename = "relationId")]
        relation_id: String,
    },
    SetCriterionAssay {
        #[serde(rename = "relationId")]
        #[ts(rename = "relationId")]
        relation_id: String,
        #[serde(rename = "criterionId")]
        #[ts(rename = "criterionId")]
        criterion_id: String,
        #[serde(rename = "assayId")]
        #[ts(rename = "assayId")]
        assay_id: String,
        linked: bool,
    },
    SetMetricDefinition {
        #[serde(rename = "metricId")]
        #[ts(rename = "metricId")]
        metric_id: String,
        definition: MetricDefinition,
    },
}

wire_type!(
    pub struct ImpactPatch {
        pub operations: Vec<ImpactPatchOperation>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum ChangeImpactTarget {
    Saved {
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
    },
    Hypothetical {
        patch: ImpactPatch,
    },
}

wire_type!(
    pub struct ChangeImpactApiRequest {
        pub baseline_revision_id: String,
        pub target: ChangeImpactTarget,
    }
);

wire_type!(
    pub struct ChangeImpactApiResponse {
        pub report: ChangeImpactReport,
        pub baseline_snapshot: WorldSnapshot,
        pub target_snapshot: WorldSnapshot,
    }
);

pub const ASSISTANT_IMPACT_PACK_ID: &str = "assistant-impact";
pub const ASSISTANT_IMPACT_PACK_VERSION: &str = "1";
pub const IMPACT_DEPENDENCY_SCOPE: &str = "impact-dependencies";
pub const IMPACT_CRITERION_SCOPE: &str = "impact-criterion-coverage";
pub const IMPACT_METRIC_SCOPE: &str = "impact-metric-lineage";
pub const MAX_IMPACT_DERIVED_PAIRS: usize = 20_000;
pub const MAX_IMPACT_WORK_UNITS: usize = 250_000;
pub const MAX_IMPACT_WITNESS_REFS: usize = 100_000;
pub const MAX_IMPACT_REPORT_BYTES: usize = 1_048_576;
pub const MAX_IMPACT_PATCH_OPERATIONS: usize = 64;
pub const MAX_IMPACT_EVIDENCE_BINDINGS: usize = 512;

#[must_use]
pub fn typescript_contract() -> String {
    macro_rules! declarations {
        ($($wire:ty),+ $(,)?) => {{
            let mut output = String::new();
            $(
                output.push_str("export ");
                output.push_str(&<$wire as TS>::decl().lines().map(str::trim_end).collect::<Vec<_>>().join("\n"));
                output.push_str("\n\n");
            )+
            output
        }};
    }
    declarations!(
        ImpactOrigin,
        ImpactSide,
        ImpactChangeKind,
        ImpactEntityKind,
        EvidenceApplicability,
        EvidenceProvenance,
        MetricStatus,
        MetricComparability,
        MetricDefinition,
        PlanItemStatus,
        ImpactProperty,
        SnapshotIdentity,
        ImpactChange,
        ImpactWitness,
        AffectedObject,
        ThingImpact,
        ImpactDiagnostic,
        BoundObjectInput,
        BoundRelationInput,
        BoundThingRevision,
        EvidenceBinding,
        EvidenceImpact,
        CriterionImpact,
        ReportingWindow,
        PlanItem,
        CompletionObservation,
        MetricAssessment,
        MetricComparison,
        ImpactAnalysisContext,
        ChangeImpactReport,
        ImpactPatchOperation,
        ImpactPatch,
        ChangeImpactTarget,
        ChangeImpactApiRequest,
        ChangeImpactApiResponse,
    )
}
