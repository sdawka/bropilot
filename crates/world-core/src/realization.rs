use crate::{
    CompletenessDeclaration, CompletenessStatus, Environment, ModelObject, ModelRelation,
    MoveSummary, ObjectShape, Purpose, RelationEndpoint, RequiredRelation, RulePackPin, Source,
    SourceKind, StateKind, Theory, TheoryClaim, Thing, ThingCapabilities, ThingTemplate,
    VersionRef, WorldSnapshot, WorldTemplate,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use ts_rs::TS;

pub const MAX_WORLD_COMMAND_BYTES: usize = 1_048_576;
pub const MAX_CANDIDATES: usize = 16;
pub const MAX_SOURCE_FILES: usize = 64;
pub const MAX_SOURCE_BYTES: usize = 65_536;
pub const MAX_MOVES: usize = 32;
pub const MAX_RUNS: usize = 32;
pub const MAX_REVISIONS: usize = 64;
pub const MAX_RECEIPTS: usize = 128;
pub const LEASE_DURATION_MS: u64 = 120_000;

macro_rules! wire_type {
    ($(#[$meta:meta])* $vis:vis struct $name:ident $body:tt) => {
        $(#[$meta])*
        #[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
        #[serde(rename_all = "camelCase")]
        #[ts(rename_all = "camelCase")]
        $vis struct $name $body
    };
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum Actor {
    Owner,
    Implementer,
    Verifier,
}

wire_type!(
    pub struct SourceBundle {
        pub files: BTreeMap<String, String>,
    }
);

wire_type!(
    pub struct HttpContract {
        pub method: String,
        pub path: String,
        pub status: u16,
        pub content_type: String,
        pub response_shape: String,
    }
);

wire_type!(
    pub struct WebAppKit {
        pub kit_id: String,
        pub version: String,
        pub entrypoint: String,
        pub assets_directory: String,
        pub required_asset: String,
        pub health: HttpContract,
        pub frontend: HttpContract,
        pub backend: HttpContract,
        pub runner_ref: String,
        pub runner_hash: String,
    }
);

wire_type!(
    pub struct AssayDefinition {
        pub assay_id: String,
        pub criterion_id: String,
        pub method: String,
        pub mandatory: bool,
        pub runner_ref: String,
        pub runner_hash: String,
    }
);

wire_type!(
    pub struct AssayPlan {
        pub plan_id: String,
        pub version: String,
        pub plan_hash: String,
        pub assays: Vec<AssayDefinition>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum MoveStatus {
    Open,
    Promoted,
}

wire_type!(
    pub struct Move {
        pub move_id: String,
        pub title: String,
        pub base_revision_id: String,
        pub desired_revision_id: String,
        pub contract_hash: String,
        pub plan_hash: String,
        pub status: MoveStatus,
        pub created_by: Actor,
        #[ts(type = "number")]
        pub created_at_ms: u64,
    }
);

wire_type!(
    pub struct Candidate {
        pub candidate_id: String,
        pub move_id: String,
        pub desired_revision_id: String,
        pub base_revision_id: String,
        pub source: SourceBundle,
        pub source_digest: String,
        pub contract_hash: String,
        pub submitted_by: Actor,
        #[ts(type = "number")]
        pub submitted_at_ms: u64,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ExecutionStatus {
    Completed,
    Error,
    NotRun,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum AssayResult {
    Pass,
    Fail,
    Unknown,
}

wire_type!(
    pub struct AssayObservation {
        pub assay_id: String,
        pub execution_status: ExecutionStatus,
        pub result: AssayResult,
        pub summary: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub raw: Option<String>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum VerificationAggregate {
    Ready,
    Blocked,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum RunStatus {
    Queued,
    Running,
    Completed,
    Error,
}

wire_type!(
    pub struct RunLease {
        pub lease_id: String,
        pub verifier_id: String,
        #[ts(type = "number")]
        pub claimed_at_ms: u64,
        #[ts(type = "number")]
        pub expires_at_ms: u64,
    }
);

wire_type!(
    pub struct AssayEvaluation {
        pub verifier_id: String,
        pub attempt: u32,
        pub source_digest: String,
        pub contract_hash: String,
        pub plan_hash: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub build_digest: Option<String>,
        pub observations: Vec<AssayObservation>,
        pub aggregate: VerificationAggregate,
        #[ts(type = "number")]
        pub completed_at_ms: u64,
    }
);

wire_type!(
    pub struct VerificationRun {
        pub run_id: String,
        pub candidate_id: String,
        pub source_digest: String,
        pub contract_hash: String,
        pub plan_hash: String,
        pub status: RunStatus,
        pub aggregate: VerificationAggregate,
        pub attempt: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub active_lease: Option<RunLease>,
        pub evaluations: Vec<AssayEvaluation>,
    }
);

wire_type!(
    pub struct WorldRevisionRecord {
        pub revision_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub parent_revision_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub candidate_id: Option<String>,
        pub created_by: Actor,
        #[ts(type = "number")]
        pub created_at_ms: u64,
    }
);

wire_type!(
    pub struct IdempotencyReceipt {
        pub request_id: String,
        pub command_hash: String,
        pub result: WorldCommandResult,
    }
);

wire_type!(
    pub struct WorldState {
        pub world_id: String,
        pub title: String,
        pub desired: WorldSnapshot,
        pub head_revision_id: String,
        pub kit: WebAppKit,
        pub assay_plan: AssayPlan,
        pub moves: Vec<Move>,
        pub candidates: Vec<Candidate>,
        pub runs: Vec<VerificationRun>,
        pub revisions: Vec<WorldRevisionRecord>,
        pub receipts: Vec<IdempotencyReceipt>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum WorldCommand {
    CreateWorld {
        #[serde(rename = "worldId")]
        #[ts(rename = "worldId")]
        world_id: String,
        title: String,
        #[serde(rename = "runnerHash")]
        #[ts(rename = "runnerHash")]
        runner_hash: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    CreateMove {
        #[serde(rename = "moveId")]
        #[ts(rename = "moveId")]
        move_id: String,
        title: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    SubmitCandidate {
        #[serde(rename = "moveId")]
        #[ts(rename = "moveId")]
        move_id: String,
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        source: SourceBundle,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    StartVerification {
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    ClaimRun {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        #[serde(rename = "leaseId")]
        #[ts(rename = "leaseId")]
        lease_id: String,
        #[serde(rename = "verifierId")]
        #[ts(rename = "verifierId")]
        verifier_id: String,
        #[serde(rename = "runnerHash")]
        #[ts(rename = "runnerHash")]
        runner_hash: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    CompleteRun {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        #[serde(rename = "leaseId")]
        #[ts(rename = "leaseId")]
        lease_id: String,
        #[serde(rename = "sourceDigest")]
        #[ts(rename = "sourceDigest")]
        source_digest: String,
        #[serde(rename = "contractHash")]
        #[ts(rename = "contractHash")]
        contract_hash: String,
        #[serde(rename = "planHash")]
        #[ts(rename = "planHash")]
        plan_hash: String,
        #[serde(rename = "buildDigest")]
        #[ts(rename = "buildDigest")]
        build_digest: Option<String>,
        observations: Vec<AssayObservation>,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    Promote {
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        #[serde(rename = "expectedHeadRevisionId")]
        #[ts(rename = "expectedHeadRevisionId")]
        expected_head_revision_id: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
}

impl WorldCommand {
    fn request_id(&self) -> &str {
        match self {
            Self::CreateWorld { request_id, .. }
            | Self::CreateMove { request_id, .. }
            | Self::SubmitCandidate { request_id, .. }
            | Self::StartVerification { request_id, .. }
            | Self::ClaimRun { request_id, .. }
            | Self::CompleteRun { request_id, .. }
            | Self::Promote { request_id, .. } => request_id,
        }
    }
}

wire_type!(
    pub struct WorldCommandRequest {
        pub api_version: u32,
        pub state: Option<Box<WorldState>>,
        pub actor: Actor,
        #[ts(type = "number")]
        pub now_ms: u64,
        pub command: WorldCommand,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
pub enum WorldCommandResult {
    WorldCreated {
        #[serde(rename = "worldId")]
        #[ts(rename = "worldId")]
        world_id: String,
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
        #[serde(rename = "moveId")]
        #[ts(rename = "moveId")]
        move_id: String,
    },
    MoveCreated {
        #[serde(rename = "moveId")]
        #[ts(rename = "moveId")]
        move_id: String,
    },
    CandidateSubmitted {
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        #[serde(rename = "sourceDigest")]
        #[ts(rename = "sourceDigest")]
        source_digest: String,
    },
    VerificationStarted {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        reused: bool,
    },
    RunClaimed {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        attempt: u32,
        #[serde(rename = "leaseExpiresAtMs")]
        #[ts(rename = "leaseExpiresAtMs")]
        #[ts(type = "number")]
        lease_expires_at_ms: u64,
    },
    RunCompleted {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        aggregate: VerificationAggregate,
    },
    CandidatePromoted {
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "status", rename_all = "camelCase")]
#[ts(tag = "status", rename_all = "camelCase")]
pub enum WorldCommandResponse {
    Ok {
        #[serde(rename = "apiVersion")]
        #[ts(rename = "apiVersion")]
        api_version: u32,
        state: Box<WorldState>,
        result: Box<WorldCommandResult>,
    },
    Error {
        #[serde(rename = "apiVersion")]
        #[ts(rename = "apiVersion")]
        api_version: u32,
        code: String,
        message: String,
    },
}

#[derive(Debug)]
struct CommandError {
    code: &'static str,
    message: String,
}

fn fail(code: &'static str, message: impl Into<String>) -> CommandError {
    CommandError {
        code,
        message: message.into(),
    }
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn hash<T: Serialize>(value: &T) -> Result<String, CommandError> {
    let bytes = serde_json::to_vec(value)
        .map_err(|error| fail("serialization_error", format!("hashing failed: {error}")))?;
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    for byte in digest {
        write!(output, "{byte:02x}").map_err(|error| {
            fail(
                "serialization_error",
                format!("hash formatting failed: {error}"),
            )
        })?;
    }
    Ok(output)
}

fn validate_text(label: &str, value: &str, max: usize) -> Result<(), CommandError> {
    if value.trim().is_empty() || value.len() > max {
        return Err(fail(
            "invalid_input",
            format!("{label} must contain 1 to {max} bytes"),
        ));
    }
    Ok(())
}

fn validate_source(source: &SourceBundle) -> Result<(), CommandError> {
    if source.files.is_empty() || source.files.len() > MAX_SOURCE_FILES {
        return Err(fail(
            "resource_limit",
            format!("source must contain 1 to {MAX_SOURCE_FILES} files"),
        ));
    }
    let mut total = 0_usize;
    for (path, contents) in &source.files {
        if path.is_empty()
            || path.len() > 256
            || !path.bytes().all(|byte| (0x20..=0x7e).contains(&byte))
            || path.starts_with('/')
            || path.contains('\\')
            || path.contains('\0')
            || path
                .split('/')
                .next()
                .is_some_and(|part| part.contains(':'))
            || path
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
        {
            return Err(fail(
                "invalid_source_path",
                format!("unsafe source path: {path}"),
            ));
        }
        total = total
            .checked_add(path.len())
            .and_then(|size| size.checked_add(contents.len()))
            .ok_or_else(|| fail("resource_limit", "source size overflow"))?;
    }
    if total > MAX_SOURCE_BYTES {
        return Err(fail(
            "resource_limit",
            format!("source exceeds {MAX_SOURCE_BYTES} bytes"),
        ));
    }
    Ok(())
}

fn source(reference: &str) -> Source {
    Source {
        kind: SourceKind::Declared,
        reference: reference.into(),
    }
}

fn hypothesis_source(reference: &str) -> Source {
    Source {
        kind: SourceKind::Hypothesis,
        reference: reference.into(),
    }
}

fn model_object(
    id: impl Into<String>,
    kind: &str,
    title: impl Into<String>,
    thing_id: Option<&str>,
    parent_id: Option<impl Into<String>>,
    reference: impl Into<String>,
) -> ModelObject {
    ModelObject {
        id: id.into(),
        kind: kind.into(),
        title: title.into(),
        thing_id: thing_id.map(str::to_owned),
        parent_id: parent_id.map(Into::into),
        properties: BTreeMap::new(),
        source: source(&reference.into()),
    }
}

fn model_relation(
    id: impl Into<String>,
    kind: &str,
    from_id: impl Into<String>,
    to_id: impl Into<String>,
    reference: &str,
) -> ModelRelation {
    ModelRelation {
        id: id.into(),
        kind: kind.into(),
        from_id: from_id.into(),
        to_id: to_id.into(),
        source: source(reference),
    }
}

fn endpoint(kind: &str, from: &str, to: &str) -> RelationEndpoint {
    RelationEndpoint {
        relation_kind: kind.into(),
        from_kinds: vec![from.into()],
        to_kinds: vec![to.into()],
    }
}

fn required_relation(
    rule_id: &str,
    subject_kind: &str,
    relation_kind: &str,
    object_kind: &str,
    scope_id: &str,
) -> RequiredRelation {
    RequiredRelation {
        rule_id: rule_id.into(),
        subject_kind: subject_kind.into(),
        relation_kind: relation_kind.into(),
        object_kind: object_kind.into(),
        scope_id: scope_id.into(),
    }
}

/// Builds the generic Worker web-app desired snapshot used by `createWorld`.
#[must_use]
#[allow(clippy::too_many_lines)]
pub fn generic_worker_world_snapshot(
    world_id: &str,
    title: &str,
    revision_id: &str,
) -> WorldSnapshot {
    let capabilities = ThingCapabilities {
        external: false,
        forkable: true,
        observable: true,
        reversible: true,
    };
    let environment_id = format!("environment:{world_id}");
    let beneficiary_id = format!("beneficiary:{world_id}");
    let thing_node_id = format!("thing-node:{world_id}:web-app");
    let outcome_id = format!("outcome:{world_id}:verified-worker-app");
    let indicator_id = format!("indicator:{world_id}:conformance");
    let evaluation_id = format!("evaluation-plan:{world_id}:candidate-verification");
    let model_ref = "built-in:worker-web-app-model@1";
    let shape_kinds = [
        "world",
        "environment",
        "beneficiary",
        "outcome",
        "indicator",
        "evaluationPlan",
        "thing",
        "acceptanceCriterion",
        "assay",
        "executionHook",
    ];
    WorldSnapshot {
        world_id: world_id.into(),
        title: title.into(),
        revision_id: revision_id.into(),
        template: WorldTemplate {
            id: "worker-web-app-world".into(),
            version: "1".into(),
            object_shapes: shape_kinds
                .iter()
                .map(|kind| ObjectShape {
                    id: format!("shape:{kind}@1"),
                    kind: (*kind).into(),
                    required_properties: match *kind {
                        "acceptanceCriterion" => vec!["criterionId".into()],
                        "assay" => vec![
                            "assayId".into(),
                            "method".into(),
                            "mandatory".into(),
                            "runnerRef".into(),
                            "runnerHash".into(),
                            "planHash".into(),
                        ],
                        "executionHook" => {
                            vec!["runnerRef".into(), "runnerHash".into()]
                        }
                        _ => Vec::new(),
                    },
                })
                .collect(),
            allowed_relation_endpoints: vec![
                endpoint("hasBeneficiary", "world", "beneficiary"),
                endpoint("hasOutcome", "world", "outcome"),
                endpoint("measuredBy", "outcome", "indicator"),
                endpoint("evaluatedBy", "outcome", "evaluationPlan"),
                endpoint("verifiedBy", "acceptanceCriterion", "assay"),
                endpoint("executedBy", "assay", "executionHook"),
            ],
            required_relations: vec![
                required_relation(
                    "worker-web-app.purpose-requires-beneficiary",
                    "world",
                    "hasBeneficiary",
                    "beneficiary",
                    "purpose-links",
                ),
                required_relation(
                    "worker-web-app.purpose-requires-outcome",
                    "world",
                    "hasOutcome",
                    "outcome",
                    "purpose-links",
                ),
                required_relation(
                    "worker-web-app.outcome-requires-indicator",
                    "outcome",
                    "measuredBy",
                    "indicator",
                    "outcome-links",
                ),
                required_relation(
                    "worker-web-app.outcome-requires-evaluation",
                    "outcome",
                    "evaluatedBy",
                    "evaluationPlan",
                    "outcome-links",
                ),
                required_relation(
                    "worker-web-app.criterion-requires-assay",
                    "acceptanceCriterion",
                    "verifiedBy",
                    "assay",
                    "assay-links",
                ),
                required_relation(
                    "worker-web-app.assay-requires-hook",
                    "assay",
                    "executedBy",
                    "executionHook",
                    "assay-links",
                ),
            ],
            forbidden_cycles: Vec::new(),
            incompatible_constraints: Vec::new(),
            required_rule_packs: vec![RulePackPin {
                id: "core-foundation".into(),
                version: "1".into(),
            }],
        },
        purpose: Purpose {
            statement: "Realize and verify a bounded full-stack Worker application".into(),
            beneficiary_ids: vec![beneficiary_id.clone()],
            outcome_ids: vec![outcome_id.clone()],
        },
        environment: Environment {
            id: environment_id.clone(),
            title: "Local isolated verification environment".into(),
        },
        phase: "realization".into(),
        state_kind: StateKind::Desired,
        things: vec![Thing {
            id: "web-app".into(),
            kind: "workerWebApp".into(),
            title: "Worker web app".into(),
            revision_id: revision_id.into(),
            template_ref: VersionRef {
                id: "worker-web-app-thing".into(),
                version: "1".into(),
            },
            capabilities: capabilities.clone(),
            external_reference: None,
            source: source("built-in:worker-web-app-kit@1"),
        }],
        thing_templates: vec![ThingTemplate {
            id: "worker-web-app-thing".into(),
            version: "1".into(),
            title: "Full-stack Worker application".into(),
            compatible_world_templates: vec![VersionRef {
                id: "worker-web-app-world".into(),
                version: "1".into(),
            }],
            inherits_world_context: true,
            capabilities,
        }],
        objects: vec![
            model_object(world_id, "world", title, None, None::<String>, model_ref),
            model_object(
                &environment_id,
                "environment",
                "Local isolated verification environment",
                None,
                Some(world_id),
                model_ref,
            ),
            model_object(
                &beneficiary_id,
                "beneficiary",
                "World owner and collaborators",
                None,
                Some(world_id),
                model_ref,
            ),
            model_object(
                &outcome_id,
                "outcome",
                "Candidates can be judged against explicit conformance evidence",
                None,
                Some(world_id),
                model_ref,
            ),
            model_object(
                &indicator_id,
                "indicator",
                "Current trusted mandatory Assay coverage",
                None,
                Some(&outcome_id),
                model_ref,
            ),
            model_object(
                &evaluation_id,
                "evaluationPlan",
                "Evaluate exact candidate source with the protected deterministic plan",
                None,
                Some(&outcome_id),
                model_ref,
            ),
            model_object(
                &thing_node_id,
                "thing",
                "Worker web app",
                Some("web-app"),
                Some(world_id),
                model_ref,
            ),
        ],
        relations: vec![
            model_relation(
                format!("relation:{world_id}:beneficiary"),
                "hasBeneficiary",
                world_id,
                &beneficiary_id,
                model_ref,
            ),
            model_relation(
                format!("relation:{world_id}:outcome"),
                "hasOutcome",
                world_id,
                &outcome_id,
                model_ref,
            ),
            model_relation(
                format!("relation:{world_id}:indicator"),
                "measuredBy",
                &outcome_id,
                &indicator_id,
                model_ref,
            ),
            model_relation(
                format!("relation:{world_id}:evaluation"),
                "evaluatedBy",
                &outcome_id,
                &evaluation_id,
                model_ref,
            ),
        ],
        completeness: ["purpose-links", "outcome-links", "assay-links"]
            .into_iter()
            .map(|scope_id| CompletenessDeclaration {
                scope_id: scope_id.into(),
                status: CompletenessStatus::Complete,
                source: source(&format!("{model_ref}:scope:{scope_id}")),
            })
            .collect(),
        theory: Theory {
            claims: vec![TheoryClaim {
                id: format!("claim:{world_id}:trusted-verification"),
                title: "Pinned independent verification supports reliable promotion decisions"
                    .into(),
                outcome_id: outcome_id.clone(),
                indicator_ids: vec![indicator_id],
                evaluation_ids: vec![evaluation_id],
                source: hypothesis_source("built-in:worker-web-app-theory@1"),
            }],
        },
        moves: vec![MoveSummary {
            id: format!("move:{world_id}:initial"),
            title: "Realize the initial Worker web app".into(),
            base_revision_id: revision_id.into(),
            status: "planned".into(),
        }],
        rule_packs: vec![RulePackPin {
            id: "core-foundation".into(),
            version: "1".into(),
        }],
        active_constraints: Vec::new(),
    }
}

fn attach_acceptance_contract(snapshot: &mut WorldSnapshot, plan: &AssayPlan) {
    let thing_node_id = format!("thing-node:{}:web-app", snapshot.world_id);
    let protected_ref = format!(
        "protected:assay-plan:{}@{}#{}",
        plan.plan_id, plan.version, plan.plan_hash
    );
    for definition in &plan.assays {
        let criterion_id = format!("criterion:{}", definition.criterion_id);
        let assay_id = format!("assay:{}", definition.assay_id);
        let hook_id = format!("hook:{}", definition.assay_id);
        let mut criterion = model_object(
            &criterion_id,
            "acceptanceCriterion",
            &definition.criterion_id,
            Some("web-app"),
            Some(&thing_node_id),
            &protected_ref,
        );
        criterion
            .properties
            .insert("criterionId".into(), definition.criterion_id.clone());
        let mut assay = model_object(
            &assay_id,
            "assay",
            &definition.assay_id,
            Some("web-app"),
            Some(&criterion_id),
            &protected_ref,
        );
        assay
            .properties
            .insert("assayId".into(), definition.assay_id.clone());
        assay
            .properties
            .insert("method".into(), definition.method.clone());
        assay
            .properties
            .insert("mandatory".into(), definition.mandatory.to_string());
        assay
            .properties
            .insert("runnerRef".into(), definition.runner_ref.clone());
        assay
            .properties
            .insert("runnerHash".into(), definition.runner_hash.clone());
        assay
            .properties
            .insert("planHash".into(), plan.plan_hash.clone());
        let mut hook = model_object(
            &hook_id,
            "executionHook",
            format!("Protected hook for {}", definition.assay_id),
            Some("web-app"),
            Some(&assay_id),
            &protected_ref,
        );
        hook.properties
            .insert("runnerRef".into(), definition.runner_ref.clone());
        hook.properties
            .insert("runnerHash".into(), definition.runner_hash.clone());
        snapshot.objects.extend([criterion, assay, hook]);
        snapshot.relations.push(model_relation(
            format!("relation:{}:verified-by", definition.assay_id),
            "verifiedBy",
            &criterion_id,
            &assay_id,
            &protected_ref,
        ));
        snapshot.relations.push(model_relation(
            format!("relation:{}:executed-by", definition.assay_id),
            "executedBy",
            &assay_id,
            &hook_id,
            &protected_ref,
        ));
    }
}

fn built_in_contract(runner_hash: &str) -> Result<(WebAppKit, AssayPlan, String), CommandError> {
    if !is_sha256(runner_hash) {
        return Err(fail(
            "invalid_runner_hash",
            "runnerHash must be a lowercase SHA-256",
        ));
    }
    let kit = WebAppKit {
        kit_id: "worker-web-app".into(),
        version: "1".into(),
        entrypoint: "worker.ts".into(),
        assets_directory: "public".into(),
        required_asset: "public/index.html".into(),
        health: HttpContract {
            method: "GET".into(),
            path: "/health".into(),
            status: 200,
            content_type: "application/json".into(),
            response_shape: r#"{status:"ok"}"#.into(),
        },
        frontend: HttpContract {
            method: "GET".into(),
            path: "/".into(),
            status: 200,
            content_type: "text/html".into(),
            response_shape: "nonempty html".into(),
        },
        backend: HttpContract {
            method: "GET".into(),
            path: "/api/message".into(),
            status: 200,
            content_type: "application/json".into(),
            response_shape: "{message:nonempty string}".into(),
        },
        runner_ref: "local-worker@1".into(),
        runner_hash: runner_hash.into(),
    };
    let assays = [
        ("artifact.exists", "web-app.implementation-exists"),
        ("artifact.build-start", "web-app.builds-and-starts"),
        ("app.health", "web-app.health-contract"),
        ("app.surfaces", "web-app.full-stack-surfaces"),
    ]
    .into_iter()
    .map(|(assay_id, criterion_id)| AssayDefinition {
        assay_id: assay_id.into(),
        criterion_id: criterion_id.into(),
        method: "deterministic".into(),
        mandatory: true,
        runner_ref: kit.runner_ref.clone(),
        runner_hash: kit.runner_hash.clone(),
    })
    .collect::<Vec<_>>();
    let plan_hash = hash(&("worker-web-app-verification", "1", &assays))?;
    let plan = AssayPlan {
        plan_id: "worker-web-app-verification".into(),
        version: "1".into(),
        plan_hash,
        assays,
    };
    let contract_hash = hash(&(&kit, &plan))?;
    Ok((kit, plan, contract_hash))
}

fn initial_state(
    actor: &Actor,
    now_ms: u64,
    world_id: String,
    title: String,
    runner_hash: &str,
) -> Result<(WorldState, WorldCommandResult), CommandError> {
    if actor != &Actor::Owner {
        return Err(fail("forbidden", "only an owner can create a World"));
    }
    validate_text("worldId", &world_id, 128)?;
    validate_text("title", &title, 256)?;
    let (kit, assay_plan, contract_hash) = built_in_contract(runner_hash)?;
    let revision_id = format!(
        "revision:{}",
        hash(&(&world_id, &title, &contract_hash, &assay_plan.plan_hash))?
    );
    let mut desired = generic_worker_world_snapshot(&world_id, &title, &revision_id);
    attach_acceptance_contract(&mut desired, &assay_plan);
    let move_id = format!("move:{world_id}:initial");
    let initial_move = Move {
        move_id: move_id.clone(),
        title: "Realize the initial Worker web app".into(),
        base_revision_id: revision_id.clone(),
        desired_revision_id: revision_id.clone(),
        contract_hash,
        plan_hash: assay_plan.plan_hash.clone(),
        status: MoveStatus::Open,
        created_by: actor.clone(),
        created_at_ms: now_ms,
    };
    let state = WorldState {
        world_id: world_id.clone(),
        title,
        desired,
        head_revision_id: revision_id.clone(),
        kit,
        assay_plan,
        moves: vec![initial_move],
        candidates: Vec::new(),
        runs: Vec::new(),
        revisions: vec![WorldRevisionRecord {
            revision_id: revision_id.clone(),
            parent_revision_id: None,
            candidate_id: None,
            created_by: actor.clone(),
            created_at_ms: now_ms,
        }],
        receipts: Vec::new(),
    };
    Ok((
        state,
        WorldCommandResult::WorldCreated {
            world_id,
            revision_id,
            move_id,
        },
    ))
}

fn require_actor(actor: &Actor, expected: &Actor, action: &str) -> Result<(), CommandError> {
    if actor != expected {
        return Err(fail(
            "forbidden",
            format!("only a {expected:?} can {action}"),
        ));
    }
    Ok(())
}

fn validate_observations(
    plan: &AssayPlan,
    observations: &[AssayObservation],
) -> Result<VerificationAggregate, CommandError> {
    if observations.len() != plan.assays.len() {
        return Err(fail(
            "invalid_observations",
            "every protected Assay must be reported exactly once",
        ));
    }
    let required = plan
        .assays
        .iter()
        .map(|assay| assay.assay_id.as_str())
        .collect::<BTreeSet<_>>();
    let mut observed = BTreeSet::new();
    let mut raw_size = 0_usize;
    for observation in observations {
        if !required.contains(observation.assay_id.as_str())
            || !observed.insert(observation.assay_id.as_str())
        {
            return Err(fail(
                "invalid_observations",
                "unsupported or duplicate assayId",
            ));
        }
        validate_text("observation summary", &observation.summary, 512)?;
        raw_size = raw_size.saturating_add(observation.raw.as_ref().map_or(0, String::len));
        if observation
            .raw
            .as_ref()
            .is_some_and(|raw| raw.len() > 4_096)
            || raw_size > 16_384
        {
            return Err(fail(
                "resource_limit",
                "raw observations exceed the bounded evidence limit",
            ));
        }
        match observation.execution_status {
            ExecutionStatus::Completed => {}
            ExecutionStatus::Error | ExecutionStatus::NotRun
                if observation.result == AssayResult::Unknown => {}
            ExecutionStatus::Error | ExecutionStatus::NotRun => {
                return Err(fail(
                    "invalid_observations",
                    "error and notRun observations must remain unknown",
                ));
            }
        }
    }
    if observed != required {
        return Err(fail(
            "invalid_observations",
            "protected Assay report is incomplete",
        ));
    }
    Ok(
        if observations
            .iter()
            .any(|item| item.result == AssayResult::Fail)
        {
            VerificationAggregate::Blocked
        } else if observations
            .iter()
            .any(|item| item.result == AssayResult::Unknown)
        {
            VerificationAggregate::Unknown
        } else {
            VerificationAggregate::Ready
        },
    )
}

#[allow(clippy::too_many_lines)]
fn validate_state(state: &WorldState) -> Result<(), CommandError> {
    if state.candidates.len() > MAX_CANDIDATES
        || state.moves.len() > MAX_MOVES
        || state.runs.len() > MAX_RUNS
        || state.revisions.len() > MAX_REVISIONS
        || state.receipts.len() > MAX_RECEIPTS
    {
        return Err(fail("resource_limit", "World state record limit exceeded"));
    }
    let (expected_kit, expected_plan, expected_contract_hash) =
        built_in_contract(&state.kit.runner_hash)?;
    if state.kit != expected_kit || state.assay_plan != expected_plan {
        return Err(fail(
            "invalid_state",
            "protected Kit or Assay plan does not match the built-in contract",
        ));
    }
    if state.world_id != state.desired.world_id
        || state.title != state.desired.title
        || !state
            .revisions
            .iter()
            .any(|revision| revision.revision_id == state.head_revision_id)
    {
        return Err(fail(
            "invalid_state",
            "World identity or canonical head is invalid",
        ));
    }
    let mut move_ids = BTreeSet::new();
    for item in &state.moves {
        if !move_ids.insert(item.move_id.as_str())
            || item.desired_revision_id != state.desired.revision_id
            || item.contract_hash != expected_contract_hash
            || item.plan_hash != state.assay_plan.plan_hash
        {
            return Err(fail(
                "invalid_state",
                "Move identity or protected binding is invalid",
            ));
        }
    }
    let mut candidate_ids = BTreeSet::new();
    for candidate in &state.candidates {
        validate_source(&candidate.source)?;
        let Some(selected_move) = state
            .moves
            .iter()
            .find(|item| item.move_id == candidate.move_id)
        else {
            return Err(fail(
                "invalid_state",
                "candidate references an unknown Move",
            ));
        };
        if !candidate_ids.insert(candidate.candidate_id.as_str())
            || hash(&candidate.source)? != candidate.source_digest
            || candidate.base_revision_id != selected_move.base_revision_id
            || candidate.desired_revision_id != selected_move.desired_revision_id
            || candidate.contract_hash != selected_move.contract_hash
        {
            return Err(fail(
                "invalid_state",
                "candidate identity, source digest, or Move binding is invalid",
            ));
        }
    }
    let mut run_ids = BTreeSet::new();
    let mut run_candidates = BTreeSet::new();
    for run in &state.runs {
        let Some(candidate) = state
            .candidates
            .iter()
            .find(|item| item.candidate_id == run.candidate_id)
        else {
            return Err(fail("invalid_state", "run references an unknown candidate"));
        };
        if !run_ids.insert(run.run_id.as_str())
            || !run_candidates.insert(run.candidate_id.as_str())
            || run.source_digest != candidate.source_digest
            || run.contract_hash != candidate.contract_hash
            || run.plan_hash != state.assay_plan.plan_hash
        {
            return Err(fail(
                "invalid_state",
                "run identity or candidate binding is invalid",
            ));
        }
        for evaluation in &run.evaluations {
            validate_observations(&state.assay_plan, &evaluation.observations)?;
            if evaluation.attempt == 0
                || evaluation.attempt > run.attempt
                || evaluation.source_digest != run.source_digest
                || evaluation.contract_hash != run.contract_hash
                || evaluation.plan_hash != run.plan_hash
            {
                return Err(fail("invalid_state", "evaluation provenance is invalid"));
            }
        }
    }
    let mut request_ids = BTreeSet::new();
    if state
        .receipts
        .iter()
        .any(|receipt| !request_ids.insert(receipt.request_id.as_str()))
    {
        return Err(fail(
            "invalid_state",
            "idempotency receipt IDs are not unique",
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_lines)]
fn apply_command(
    mut state: WorldState,
    actor: &Actor,
    now_ms: u64,
    command: &WorldCommand,
) -> Result<(WorldState, WorldCommandResult), CommandError> {
    let result = match command {
        WorldCommand::CreateWorld { .. } => {
            return Err(fail(
                "world_already_exists",
                "state already contains a World",
            ));
        }
        WorldCommand::CreateMove { move_id, title, .. } => {
            require_actor(actor, &Actor::Owner, "create a Move")?;
            validate_text("moveId", move_id, 128)?;
            validate_text("title", title, 256)?;
            if state.moves.len() >= MAX_MOVES {
                return Err(fail("resource_limit", "Move limit reached"));
            }
            if state.moves.iter().any(|item| item.move_id == *move_id) {
                return Err(fail("duplicate_id", "moveId already exists"));
            }
            state.moves.push(Move {
                move_id: move_id.clone(),
                title: title.clone(),
                base_revision_id: state.head_revision_id.clone(),
                desired_revision_id: state.desired.revision_id.clone(),
                contract_hash: hash(&(&state.kit, &state.assay_plan))?,
                plan_hash: state.assay_plan.plan_hash.clone(),
                status: MoveStatus::Open,
                created_by: actor.clone(),
                created_at_ms: now_ms,
            });
            WorldCommandResult::MoveCreated {
                move_id: move_id.clone(),
            }
        }
        WorldCommand::SubmitCandidate {
            move_id,
            candidate_id,
            source,
            ..
        } => {
            require_actor(actor, &Actor::Implementer, "submit a candidate")?;
            validate_text("candidateId", candidate_id, 128)?;
            validate_source(source)?;
            if state.candidates.len() >= MAX_CANDIDATES {
                return Err(fail("resource_limit", "candidate limit reached"));
            }
            if state
                .candidates
                .iter()
                .any(|item| item.candidate_id == *candidate_id)
            {
                return Err(fail("duplicate_id", "candidateId already exists"));
            }
            let selected_move = state
                .moves
                .iter()
                .find(|item| item.move_id == *move_id)
                .ok_or_else(|| fail("not_found", "Move not found"))?;
            if selected_move.status != MoveStatus::Open {
                return Err(fail("move_closed", "Move is no longer open"));
            }
            let source_digest = hash(source)?;
            state.candidates.push(Candidate {
                candidate_id: candidate_id.clone(),
                move_id: move_id.clone(),
                desired_revision_id: selected_move.desired_revision_id.clone(),
                base_revision_id: selected_move.base_revision_id.clone(),
                source: source.clone(),
                source_digest: source_digest.clone(),
                contract_hash: selected_move.contract_hash.clone(),
                submitted_by: actor.clone(),
                submitted_at_ms: now_ms,
            });
            WorldCommandResult::CandidateSubmitted {
                candidate_id: candidate_id.clone(),
                source_digest,
            }
        }
        WorldCommand::StartVerification { candidate_id, .. } => {
            require_actor(actor, &Actor::Owner, "start verification")?;
            let candidate = state
                .candidates
                .iter()
                .find(|item| item.candidate_id == *candidate_id)
                .ok_or_else(|| fail("not_found", "candidate not found"))?;
            if let Some(run) = state
                .runs
                .iter()
                .find(|item| item.candidate_id == *candidate_id)
            {
                WorldCommandResult::VerificationStarted {
                    run_id: run.run_id.clone(),
                    reused: true,
                }
            } else {
                if state.runs.len() >= MAX_RUNS {
                    return Err(fail("resource_limit", "verification run limit reached"));
                }
                let run_id = format!(
                    "run:{}",
                    &hash(&(
                        candidate_id,
                        &candidate.source_digest,
                        &state.assay_plan.plan_hash
                    ))?[..32]
                );
                state.runs.push(VerificationRun {
                    run_id: run_id.clone(),
                    candidate_id: candidate_id.clone(),
                    source_digest: candidate.source_digest.clone(),
                    contract_hash: candidate.contract_hash.clone(),
                    plan_hash: state.assay_plan.plan_hash.clone(),
                    status: RunStatus::Queued,
                    aggregate: VerificationAggregate::Unknown,
                    attempt: 0,
                    active_lease: None,
                    evaluations: Vec::new(),
                });
                WorldCommandResult::VerificationStarted {
                    run_id,
                    reused: false,
                }
            }
        }
        WorldCommand::ClaimRun {
            run_id,
            lease_id,
            verifier_id,
            runner_hash,
            ..
        } => {
            require_actor(actor, &Actor::Verifier, "claim a run")?;
            validate_text("leaseId", lease_id, 128)?;
            validate_text("verifierId", verifier_id, 128)?;
            if runner_hash != &state.kit.runner_hash {
                return Err(fail(
                    "runner_mismatch",
                    "runnerHash does not match the protected plan",
                ));
            }
            let run = state
                .runs
                .iter_mut()
                .find(|item| item.run_id == *run_id)
                .ok_or_else(|| fail("not_found", "verification run not found"))?;
            let reclaimable = match run.status {
                RunStatus::Queued | RunStatus::Error => true,
                RunStatus::Running => run
                    .active_lease
                    .as_ref()
                    .is_none_or(|lease| lease.expires_at_ms <= now_ms),
                RunStatus::Completed => false,
            };
            if !reclaimable {
                return Err(fail(
                    "run_not_claimable",
                    "run is completed or has an active lease",
                ));
            }
            run.attempt = run
                .attempt
                .checked_add(1)
                .ok_or_else(|| fail("resource_limit", "attempt counter overflow"))?;
            let lease_expires_at_ms = now_ms
                .checked_add(LEASE_DURATION_MS)
                .ok_or_else(|| fail("invalid_input", "lease expiry overflow"))?;
            run.status = RunStatus::Running;
            run.active_lease = Some(RunLease {
                lease_id: lease_id.clone(),
                verifier_id: verifier_id.clone(),
                claimed_at_ms: now_ms,
                expires_at_ms: lease_expires_at_ms,
            });
            WorldCommandResult::RunClaimed {
                run_id: run_id.clone(),
                attempt: run.attempt,
                lease_expires_at_ms,
            }
        }
        WorldCommand::CompleteRun {
            run_id,
            lease_id,
            source_digest,
            contract_hash,
            plan_hash,
            build_digest,
            observations,
            ..
        } => {
            require_actor(actor, &Actor::Verifier, "complete a run")?;
            let aggregate = validate_observations(&state.assay_plan, observations)?;
            let run = state
                .runs
                .iter_mut()
                .find(|item| item.run_id == *run_id)
                .ok_or_else(|| fail("not_found", "verification run not found"))?;
            if run.status != RunStatus::Running {
                return Err(fail("run_not_running", "run has no active execution"));
            }
            let lease = run
                .active_lease
                .as_ref()
                .ok_or_else(|| fail("lease_mismatch", "run has no active lease"))?;
            if lease.lease_id != *lease_id {
                return Err(fail("lease_mismatch", "leaseId does not own this run"));
            }
            if lease.expires_at_ms <= now_ms {
                return Err(fail("lease_expired", "run lease has expired"));
            }
            if run.source_digest != *source_digest
                || run.contract_hash != *contract_hash
                || run.plan_hash != *plan_hash
            {
                return Err(fail(
                    "binding_mismatch",
                    "completion hashes do not match the pinned run",
                ));
            }
            if build_digest
                .as_ref()
                .is_some_and(|digest| digest.len() > 128)
            {
                return Err(fail("invalid_input", "buildDigest is too long"));
            }
            let has_execution_error = observations
                .iter()
                .any(|item| item.execution_status == ExecutionStatus::Error);
            run.evaluations.push(AssayEvaluation {
                verifier_id: lease.verifier_id.clone(),
                attempt: run.attempt,
                source_digest: source_digest.clone(),
                contract_hash: contract_hash.clone(),
                plan_hash: plan_hash.clone(),
                build_digest: build_digest.clone(),
                observations: observations.clone(),
                aggregate: aggregate.clone(),
                completed_at_ms: now_ms,
            });
            run.aggregate = aggregate.clone();
            run.status = if has_execution_error {
                RunStatus::Error
            } else {
                RunStatus::Completed
            };
            run.active_lease = None;
            WorldCommandResult::RunCompleted {
                run_id: run_id.clone(),
                aggregate,
            }
        }
        WorldCommand::Promote {
            candidate_id,
            expected_head_revision_id,
            ..
        } => {
            require_actor(actor, &Actor::Owner, "promote a candidate")?;
            if state.head_revision_id != *expected_head_revision_id {
                return Err(fail("stale_head", "expected head is no longer canonical"));
            }
            let candidate = state
                .candidates
                .iter()
                .find(|item| item.candidate_id == *candidate_id)
                .ok_or_else(|| fail("not_found", "candidate not found"))?;
            if candidate.base_revision_id != state.head_revision_id {
                return Err(fail(
                    "stale_move",
                    "candidate Move is based on an older canonical revision",
                ));
            }
            let run = state
                .runs
                .iter()
                .find(|item| item.candidate_id == *candidate_id)
                .ok_or_else(|| {
                    fail(
                        "promotion_blocked",
                        "candidate has no trusted verification run",
                    )
                })?;
            let evaluation = run
                .evaluations
                .last()
                .ok_or_else(|| fail("promotion_blocked", "candidate has no completed evidence"))?;
            let evidence_is_current = run.status == RunStatus::Completed
                && run.aggregate == VerificationAggregate::Ready
                && run.source_digest == candidate.source_digest
                && run.contract_hash == candidate.contract_hash
                && run.plan_hash == state.assay_plan.plan_hash
                && evaluation.source_digest == candidate.source_digest
                && evaluation.contract_hash == candidate.contract_hash
                && evaluation.plan_hash == state.assay_plan.plan_hash
                && evaluation.build_digest.as_deref().is_some_and(is_sha256)
                && evaluation
                    .observations
                    .iter()
                    .all(|item| item.result == AssayResult::Pass);
            if !evidence_is_current {
                return Err(fail(
                    "promotion_blocked",
                    "mandatory trusted evidence is failed, unknown, invalid, or stale",
                ));
            }
            if state.revisions.len() >= MAX_REVISIONS {
                return Err(fail("resource_limit", "revision history limit reached"));
            }
            let revision_id = format!(
                "revision:{}",
                hash(&(
                    &state.head_revision_id,
                    candidate_id,
                    &candidate.source_digest,
                    &evaluation.build_digest
                ))?
            );
            let old_head = state.head_revision_id.clone();
            state.head_revision_id.clone_from(&revision_id);
            state.revisions.push(WorldRevisionRecord {
                revision_id: revision_id.clone(),
                parent_revision_id: Some(old_head),
                candidate_id: Some(candidate_id.clone()),
                created_by: actor.clone(),
                created_at_ms: now_ms,
            });
            if let Some(selected_move) = state
                .moves
                .iter_mut()
                .find(|item| item.move_id == candidate.move_id)
            {
                selected_move.status = MoveStatus::Promoted;
            }
            WorldCommandResult::CandidatePromoted {
                candidate_id: candidate_id.clone(),
                revision_id,
            }
        }
    };
    Ok((state, result))
}

fn execute(request: WorldCommandRequest) -> Result<(WorldState, WorldCommandResult), CommandError> {
    if request.api_version != 1 {
        return Err(fail(
            "unsupported_api_version",
            format!("unsupported apiVersion {}; expected 1", request.api_version),
        ));
    }
    validate_text("requestId", request.command.request_id(), 128)?;
    let command_hash = hash(&(&request.actor, &request.command))?;
    if let Some(state) = request.state.as_deref() {
        validate_state(state)?;
        if let Some(receipt) = state
            .receipts
            .iter()
            .find(|receipt| receipt.request_id == request.command.request_id())
        {
            if receipt.command_hash != command_hash {
                return Err(fail(
                    "idempotency_conflict",
                    "requestId was already used for a different command",
                ));
            }
            return Ok((state.clone(), receipt.result.clone()));
        }
    }
    let (mut state, result) = match (request.state, &request.command) {
        (
            None,
            WorldCommand::CreateWorld {
                world_id,
                title,
                runner_hash,
                ..
            },
        ) => initial_state(
            &request.actor,
            request.now_ms,
            world_id.clone(),
            title.clone(),
            runner_hash,
        )?,
        (None, _) => return Err(fail("missing_state", "this command requires World state")),
        (Some(state), _) => {
            apply_command(*state, &request.actor, request.now_ms, &request.command)?
        }
    };
    if state.receipts.len() >= MAX_RECEIPTS {
        return Err(fail("resource_limit", "idempotency receipt limit reached"));
    }
    state.receipts.push(IdempotencyReceipt {
        request_id: request.command.request_id().into(),
        command_hash,
        result: result.clone(),
    });
    validate_state(&state)?;
    let state_bytes = serde_json::to_vec(&state).map_err(|error| {
        fail(
            "serialization_error",
            format!("state serialization failed: {error}"),
        )
    })?;
    if state_bytes.len() > MAX_WORLD_COMMAND_BYTES {
        return Err(fail(
            "resource_limit",
            "resulting World state exceeds one MiB",
        ));
    }
    Ok((state, result))
}

fn serialize_response(response: &WorldCommandResponse) -> String {
    serde_json::to_string(response).unwrap_or_else(|_| {
        r#"{"status":"error","apiVersion":1,"code":"serialization_error","message":"response serialization failed"}"#.into()
    })
}

/// Evaluates one pure World command. This function performs no I/O and reads no clock.
#[must_use]
pub fn handle_world_command(input: &str) -> String {
    if input.len() > MAX_WORLD_COMMAND_BYTES {
        return serialize_response(&WorldCommandResponse::Error {
            api_version: 1,
            code: "resource_limit".into(),
            message: "request exceeds one MiB".into(),
        });
    }
    let version = serde_json::from_str::<serde_json::Value>(input)
        .ok()
        .and_then(|value| value.get("apiVersion").and_then(serde_json::Value::as_u64));
    if version.is_some_and(|value| value != 1) {
        return serialize_response(&WorldCommandResponse::Error {
            api_version: 1,
            code: "unsupported_api_version".into(),
            message: format!(
                "unsupported apiVersion {}; expected 1",
                version.unwrap_or(0)
            ),
        });
    }
    let response = match serde_json::from_str::<WorldCommandRequest>(input) {
        Ok(request) => match execute(request) {
            Ok((state, result)) => WorldCommandResponse::Ok {
                api_version: 1,
                state: Box::new(state),
                result: Box::new(result),
            },
            Err(error) => WorldCommandResponse::Error {
                api_version: 1,
                code: error.code.into(),
                message: error.message,
            },
        },
        Err(error) => WorldCommandResponse::Error {
            api_version: 1,
            code: "malformed_request".into(),
            message: format!("request does not match the v1 World command contract: {error}"),
        },
    };
    serialize_response(&response)
}

#[must_use]
pub fn typescript_contract() -> String {
    macro_rules! declarations {
        ($($type:ty),+ $(,)?) => {{
            let mut output = String::new();
            $(output.push_str("export "); output.push_str(&<$type as TS>::decl()); output.push_str("\n\n");)+
            output
        }};
    }
    declarations!(
        Actor,
        SourceBundle,
        HttpContract,
        WebAppKit,
        AssayDefinition,
        AssayPlan,
        MoveStatus,
        Move,
        Candidate,
        ExecutionStatus,
        AssayResult,
        AssayObservation,
        VerificationAggregate,
        RunStatus,
        RunLease,
        AssayEvaluation,
        VerificationRun,
        WorldRevisionRecord,
        IdempotencyReceipt,
        WorldState,
        WorldCommand,
        WorldCommandRequest,
        WorldCommandResult,
        WorldCommandResponse,
    )
}
