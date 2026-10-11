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
pub const MAX_RETAINED_PACKAGES: usize = 64;
pub const MAX_DEPLOYMENTS: usize = 64;
pub const MAX_RUNTIME_OBSERVATIONS: usize = 128;
pub const MAX_DEPLOYMENT_TARGETS: usize = 16;
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
    Deployer,
    System,
}

wire_type!(
    pub struct PrincipalContext {
        pub principal_id: String,
        pub role: Actor,
        pub world_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub move_id: Option<String>,
        pub operations: Vec<String>,
        #[ts(type = "number")]
        pub expires_at_ms: u64,
    }
);

wire_type!(
    pub struct ArtifactSourceRef {
        pub namespace: String,
        pub repo_id: String,
        pub repo_name: String,
        pub commit_sha: String,
        pub tree_sha: String,
        pub content_digest: String,
    }
);

wire_type!(
    pub struct SourceRepository {
        pub namespace: String,
        pub repo_id: String,
        pub repo_name: String,
    }
);

wire_type!(
    pub struct RetainedPackageRef {
        pub key: String,
        pub package_digest: String,
        pub build_digest: String,
        pub source_digest: String,
        pub source_ref: ArtifactSourceRef,
        pub contract_hash: String,
        pub plan_hash: String,
        pub runner_hash: String,
        pub run_id: String,
    }
);

wire_type!(
    pub struct DeploymentTarget {
        pub target_id: String,
        pub thing_id: String,
        pub connection_id: String,
        pub account_id: String,
        pub worker_name: String,
        pub owner_principal_id: String,
    }
);

wire_type!(
    pub struct HostedWorldConfig {
        pub source_repository: SourceRepository,
        pub deployment_targets: Vec<DeploymentTarget>,
    }
);

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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub source_ref: Option<ArtifactSourceRef>,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub package_ref: Option<RetainedPackageRef>,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub package_ref: Option<RetainedPackageRef>,
        pub created_by: Actor,
        #[ts(type = "number")]
        pub created_at_ms: u64,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum DeploymentStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Uncertain,
}

wire_type!(
    pub struct DeploymentRecord {
        pub deployment_id: String,
        pub job_id: String,
        pub target_id: String,
        pub revision_id: String,
        pub package_ref: RetainedPackageRef,
        pub requester_principal_id: String,
        pub status: DeploymentStatus,
        pub progress_seq: u32,
        pub publication_authorized: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub rollback_of_deployment_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub expected_head_revision_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub expected_active_provider_version_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub provider_version_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub url: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub failure: Option<String>,
        #[ts(type = "number")]
        pub created_at_ms: u64,
        #[ts(type = "number")]
        pub updated_at_ms: u64,
    }
);

wire_type!(
    pub struct RuntimeObservation {
        pub observation_id: String,
        pub deployment_id: String,
        pub healthy: bool,
        pub summary: String,
        #[ts(type = "number")]
        pub observed_at_ms: u64,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub hosted: Option<HostedWorldConfig>,
        #[serde(default)]
        pub retained_packages: Vec<RetainedPackageRef>,
        #[serde(default)]
        pub deployments: Vec<DeploymentRecord>,
        #[serde(default)]
        pub runtime_observations: Vec<RuntimeObservation>,
    }
);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(tag = "kind", rename_all = "camelCase")]
#[allow(clippy::large_enum_variant)]
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
    CreateHostedWorld {
        #[serde(rename = "worldId")]
        #[ts(rename = "worldId")]
        world_id: String,
        title: String,
        #[serde(rename = "runnerHash")]
        #[ts(rename = "runnerHash")]
        runner_hash: String,
        #[serde(rename = "sourceRepository")]
        #[ts(rename = "sourceRepository")]
        source_repository: SourceRepository,
        #[serde(rename = "deploymentTargets")]
        #[ts(rename = "deploymentTargets")]
        deployment_targets: Vec<DeploymentTarget>,
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
    SubmitHostedCandidate {
        #[serde(rename = "moveId")]
        #[ts(rename = "moveId")]
        move_id: String,
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        source: SourceBundle,
        #[serde(rename = "sourceRef")]
        #[ts(rename = "sourceRef")]
        source_ref: ArtifactSourceRef,
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
    CompleteHostedRun {
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
        #[serde(rename = "packageRef")]
        #[ts(rename = "packageRef")]
        #[serde(default)]
        #[ts(optional)]
        package_ref: Option<RetainedPackageRef>,
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
    RequestDeployment {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "targetId")]
        #[ts(rename = "targetId")]
        target_id: String,
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
        #[serde(rename = "expectedHeadRevisionId")]
        #[ts(rename = "expectedHeadRevisionId")]
        expected_head_revision_id: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    RegisterDeploymentTarget {
        target: DeploymentTarget,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    AuthorizeDeploymentPublication {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "progressSeq")]
        #[ts(rename = "progressSeq")]
        progress_seq: u32,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    UpdateDeployment {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "progressSeq")]
        #[ts(rename = "progressSeq")]
        progress_seq: u32,
        status: DeploymentStatus,
        #[serde(rename = "providerVersionId")]
        #[ts(rename = "providerVersionId")]
        #[serde(default)]
        #[ts(optional)]
        provider_version_id: Option<String>,
        #[serde(default)]
        #[ts(optional)]
        url: Option<String>,
        #[serde(default)]
        #[ts(optional)]
        failure: Option<String>,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    RequestRollback {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "targetId")]
        #[ts(rename = "targetId")]
        target_id: String,
        #[serde(rename = "previousDeploymentId")]
        #[ts(rename = "previousDeploymentId")]
        previous_deployment_id: String,
        #[serde(rename = "expectedActiveProviderVersionId")]
        #[ts(rename = "expectedActiveProviderVersionId")]
        expected_active_provider_version_id: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
    RecordRuntimeObservation {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        healthy: bool,
        summary: String,
        #[serde(rename = "requestId")]
        #[ts(rename = "requestId")]
        request_id: String,
    },
}

impl WorldCommand {
    fn request_id(&self) -> &str {
        match self {
            Self::CreateWorld { request_id, .. }
            | Self::CreateHostedWorld { request_id, .. }
            | Self::CreateMove { request_id, .. }
            | Self::SubmitCandidate { request_id, .. }
            | Self::SubmitHostedCandidate { request_id, .. }
            | Self::StartVerification { request_id, .. }
            | Self::ClaimRun { request_id, .. }
            | Self::CompleteRun { request_id, .. }
            | Self::CompleteHostedRun { request_id, .. }
            | Self::Promote { request_id, .. }
            | Self::RequestDeployment { request_id, .. }
            | Self::RegisterDeploymentTarget { request_id, .. }
            | Self::AuthorizeDeploymentPublication { request_id, .. }
            | Self::UpdateDeployment { request_id, .. }
            | Self::RequestRollback { request_id, .. }
            | Self::RecordRuntimeObservation { request_id, .. } => request_id,
        }
    }

    fn operation(&self) -> &'static str {
        match self {
            Self::CreateWorld { .. } => "createWorld",
            Self::CreateHostedWorld { .. } => "createHostedWorld",
            Self::CreateMove { .. } => "createMove",
            Self::SubmitCandidate { .. } => "submitCandidate",
            Self::SubmitHostedCandidate { .. } => "submitHostedCandidate",
            Self::StartVerification { .. } => "startVerification",
            Self::ClaimRun { .. } => "claimRun",
            Self::CompleteRun { .. } => "completeRun",
            Self::CompleteHostedRun { .. } => "completeHostedRun",
            Self::Promote { .. } => "promote",
            Self::RequestDeployment { .. } => "requestDeployment",
            Self::RegisterDeploymentTarget { .. } => "registerDeploymentTarget",
            Self::AuthorizeDeploymentPublication { .. } => "authorizeDeploymentPublication",
            Self::UpdateDeployment { .. } => "updateDeployment",
            Self::RequestRollback { .. } => "requestRollback",
            Self::RecordRuntimeObservation { .. } => "recordRuntimeObservation",
        }
    }
}

wire_type!(
    pub struct WorldCommandRequest {
        pub api_version: u32,
        pub state: Option<Box<WorldState>>,
        pub actor: Actor,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        pub principal: Option<PrincipalContext>,
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
    HostedWorldCreated {
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
    HostedCandidateSubmitted {
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
    HostedRunCompleted {
        #[serde(rename = "runId")]
        #[ts(rename = "runId")]
        run_id: String,
        aggregate: VerificationAggregate,
        #[serde(rename = "packageDigest")]
        #[ts(rename = "packageDigest")]
        package_digest: Option<String>,
    },
    CandidatePromoted {
        #[serde(rename = "candidateId")]
        #[ts(rename = "candidateId")]
        candidate_id: String,
        #[serde(rename = "revisionId")]
        #[ts(rename = "revisionId")]
        revision_id: String,
    },
    DeploymentRequested {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "jobId")]
        #[ts(rename = "jobId")]
        job_id: String,
    },
    DeploymentTargetRegistered {
        #[serde(rename = "targetId")]
        #[ts(rename = "targetId")]
        target_id: String,
        reused: bool,
    },
    DeploymentPublicationAuthorized {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
    },
    DeploymentUpdated {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        status: DeploymentStatus,
    },
    RollbackRequested {
        #[serde(rename = "deploymentId")]
        #[ts(rename = "deploymentId")]
        deployment_id: String,
        #[serde(rename = "jobId")]
        #[ts(rename = "jobId")]
        job_id: String,
    },
    RuntimeObservationRecorded {
        #[serde(rename = "observationId")]
        #[ts(rename = "observationId")]
        observation_id: String,
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

fn is_git_hash(value: &str) -> bool {
    matches!(value.len(), 40 | 64)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn validate_repository(repository: &SourceRepository) -> Result<(), CommandError> {
    validate_text("repository namespace", &repository.namespace, 128)?;
    validate_text("repository id", &repository.repo_id, 128)?;
    validate_text("repository name", &repository.repo_name, 128)
}

fn validate_source_ref(
    source_ref: &ArtifactSourceRef,
    repository: &SourceRepository,
) -> Result<(), CommandError> {
    validate_text("source namespace", &source_ref.namespace, 128)?;
    validate_text("source repository id", &source_ref.repo_id, 128)?;
    validate_text("source repository name", &source_ref.repo_name, 128)?;
    if source_ref.namespace != repository.namespace
        || source_ref.repo_id != repository.repo_id
        || source_ref.repo_name != repository.repo_name
    {
        return Err(fail(
            "binding_mismatch",
            "sourceRef does not belong to the hosted repository",
        ));
    }
    if !is_git_hash(&source_ref.commit_sha)
        || !is_git_hash(&source_ref.tree_sha)
        || !is_sha256(&source_ref.content_digest)
    {
        return Err(fail(
            "invalid_input",
            "sourceRef hashes are not canonical immutable digests",
        ));
    }
    Ok(())
}

fn validate_target(target: &DeploymentTarget) -> Result<(), CommandError> {
    validate_text("targetId", &target.target_id, 128)?;
    validate_text("thingId", &target.thing_id, 128)?;
    validate_text("connectionId", &target.connection_id, 128)?;
    validate_text("accountId", &target.account_id, 128)?;
    validate_text("workerName", &target.worker_name, 128)?;
    validate_text("ownerPrincipalId", &target.owner_principal_id, 128)?;
    if target.thing_id != "web-app" {
        return Err(fail("invalid_input", "deployment target must bind web-app"));
    }
    Ok(())
}

fn command_move_id<'a>(
    command: &'a WorldCommand,
    state: Option<&'a WorldState>,
) -> Option<&'a str> {
    match command {
        WorldCommand::CreateMove { move_id, .. }
        | WorldCommand::SubmitCandidate { move_id, .. }
        | WorldCommand::SubmitHostedCandidate { move_id, .. } => Some(move_id),
        WorldCommand::StartVerification { candidate_id, .. }
        | WorldCommand::Promote { candidate_id, .. } => state?
            .candidates
            .iter()
            .find(|candidate| candidate.candidate_id == *candidate_id)
            .map(|candidate| candidate.move_id.as_str()),
        WorldCommand::ClaimRun { run_id, .. }
        | WorldCommand::CompleteRun { run_id, .. }
        | WorldCommand::CompleteHostedRun { run_id, .. } => {
            let state = state?;
            let candidate_id = state
                .runs
                .iter()
                .find(|run| run.run_id == *run_id)?
                .candidate_id
                .as_str();
            state
                .candidates
                .iter()
                .find(|candidate| candidate.candidate_id == candidate_id)
                .map(|candidate| candidate.move_id.as_str())
        }
        _ => None,
    }
}

fn validate_principal(
    principal: Option<&PrincipalContext>,
    actor: &Actor,
    now_ms: u64,
    world_id: &str,
    state: Option<&WorldState>,
    command: &WorldCommand,
) -> Result<(), CommandError> {
    let principal = principal.ok_or_else(|| {
        fail(
            "principal_required",
            "hosted World commands require trusted principal context",
        )
    })?;
    validate_text("principalId", &principal.principal_id, 128)?;
    if principal.expires_at_ms <= now_ms {
        return Err(fail("principal_expired", "principal context has expired"));
    }
    if principal.world_id != world_id {
        return Err(fail(
            "principal_scope_mismatch",
            "principal is scoped to a different World",
        ));
    }
    if let Some(scoped_move) = &principal.move_id
        && command_move_id(command, state) != Some(scoped_move.as_str())
    {
        return Err(fail(
            "principal_scope_mismatch",
            "principal is scoped to a different Move",
        ));
    }
    if principal.operations.len() > 32
        || !principal
            .operations
            .iter()
            .any(|operation| operation == command.operation())
    {
        return Err(fail(
            "principal_operation_forbidden",
            "principal does not grant this operation",
        ));
    }
    for operation in &principal.operations {
        validate_text("principal operation", operation, 128)?;
    }
    let owner_implementing = principal.role == Actor::Owner
        && actor == &Actor::Implementer
        && matches!(command, WorldCommand::SubmitHostedCandidate { .. });
    if principal.role != *actor && !owner_implementing {
        return Err(fail(
            "principal_role_mismatch",
            "principal role does not authorize the effective actor",
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
            package_ref: None,
            created_by: actor.clone(),
            created_at_ms: now_ms,
        }],
        receipts: Vec::new(),
        hosted: None,
        retained_packages: Vec::new(),
        deployments: Vec::new(),
        runtime_observations: Vec::new(),
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

fn initial_hosted_state(
    actor: &Actor,
    now_ms: u64,
    world_id: String,
    title: String,
    runner_hash: &str,
    source_repository: SourceRepository,
    deployment_targets: Vec<DeploymentTarget>,
) -> Result<(WorldState, WorldCommandResult), CommandError> {
    validate_repository(&source_repository)?;
    if deployment_targets.len() > MAX_DEPLOYMENT_TARGETS {
        return Err(fail("resource_limit", "deployment target limit reached"));
    }
    let mut target_ids = BTreeSet::new();
    for target in &deployment_targets {
        validate_target(target)?;
        if !target_ids.insert(target.target_id.as_str()) {
            return Err(fail("duplicate_id", "targetId already exists"));
        }
    }
    let (mut state, result) = initial_state(actor, now_ms, world_id, title, runner_hash)?;
    state.hosted = Some(HostedWorldConfig {
        source_repository,
        deployment_targets,
    });
    let WorldCommandResult::WorldCreated {
        world_id,
        revision_id,
        move_id,
    } = result
    else {
        unreachable!("initial state always creates a World")
    };
    Ok((
        state,
        WorldCommandResult::HostedWorldCreated {
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

fn validate_package_binding(
    package: &RetainedPackageRef,
    run: &VerificationRun,
    candidate: &Candidate,
    state: &WorldState,
) -> Result<(), CommandError> {
    validate_text("package key", &package.key, 512)?;
    if !is_sha256(&package.package_digest) || !is_sha256(&package.build_digest) {
        return Err(fail(
            "invalid_input",
            "package and build digests must be lowercase SHA-256",
        ));
    }
    let candidate_source_ref = candidate.source_ref.as_ref().ok_or_else(|| {
        fail(
            "binding_mismatch",
            "hosted package requires an immutable candidate sourceRef",
        )
    })?;
    let hosted = state.hosted.as_ref().ok_or_else(|| {
        fail(
            "invalid_state",
            "hosted package requires hosted World state",
        )
    })?;
    validate_source_ref(&package.source_ref, &hosted.source_repository)?;
    if package.source_digest != run.source_digest
        || package.source_ref != *candidate_source_ref
        || package.contract_hash != run.contract_hash
        || package.plan_hash != run.plan_hash
        || package.runner_hash != state.kit.runner_hash
        || package.run_id != run.run_id
    {
        return Err(fail(
            "binding_mismatch",
            "retained package does not match the exact trusted run",
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_lines)]
fn validate_state(state: &WorldState) -> Result<(), CommandError> {
    if state.candidates.len() > MAX_CANDIDATES
        || state.moves.len() > MAX_MOVES
        || state.runs.len() > MAX_RUNS
        || state.revisions.len() > MAX_REVISIONS
        || state.receipts.len() > MAX_RECEIPTS
        || state.retained_packages.len() > MAX_RETAINED_PACKAGES
        || state.deployments.len() > MAX_DEPLOYMENTS
        || state.runtime_observations.len() > MAX_RUNTIME_OBSERVATIONS
    {
        return Err(fail("resource_limit", "World state record limit exceeded"));
    }
    if let Some(hosted) = &state.hosted {
        validate_repository(&hosted.source_repository)?;
        if hosted.deployment_targets.len() > MAX_DEPLOYMENT_TARGETS {
            return Err(fail("resource_limit", "deployment target limit reached"));
        }
        let mut target_ids = BTreeSet::new();
        for target in &hosted.deployment_targets {
            validate_target(target)?;
            if !target_ids.insert(target.target_id.as_str()) {
                return Err(fail(
                    "invalid_state",
                    "deployment target IDs are not unique",
                ));
            }
        }
    } else if !state.retained_packages.is_empty()
        || !state.deployments.is_empty()
        || !state.runtime_observations.is_empty()
    {
        return Err(fail("invalid_state", "local World contains hosted records"));
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
        match (&state.hosted, &candidate.source_ref) {
            (Some(hosted), Some(source_ref)) => {
                validate_source_ref(source_ref, &hosted.source_repository)?;
            }
            (Some(_), None) => {
                return Err(fail("invalid_state", "hosted candidate has no sourceRef"));
            }
            (None, Some(_)) => {
                return Err(fail(
                    "invalid_state",
                    "local candidate contains hosted sourceRef",
                ));
            }
            (None, None) => {}
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
            if let Some(package) = &evaluation.package_ref {
                validate_package_binding(package, run, candidate, state)?;
                if evaluation.build_digest.as_ref() != Some(&package.build_digest) {
                    return Err(fail(
                        "invalid_state",
                        "package build digest is inconsistent",
                    ));
                }
            }
        }
    }
    let mut package_keys = BTreeSet::new();
    for package in &state.retained_packages {
        if !package_keys.insert(package.key.as_str()) {
            return Err(fail(
                "invalid_state",
                "retained package keys are not unique",
            ));
        }
        let run = state
            .runs
            .iter()
            .find(|run| run.run_id == package.run_id)
            .ok_or_else(|| fail("invalid_state", "retained package run is missing"))?;
        let candidate = state
            .candidates
            .iter()
            .find(|candidate| candidate.candidate_id == run.candidate_id)
            .ok_or_else(|| fail("invalid_state", "retained package candidate is missing"))?;
        validate_package_binding(package, run, candidate, state)?;
    }
    let mut deployment_ids = BTreeSet::new();
    let mut active_targets = BTreeSet::new();
    for deployment in &state.deployments {
        if !deployment_ids.insert(deployment.deployment_id.as_str())
            || deployment.job_id != format!("job:{}", deployment.deployment_id)
            || !state.retained_packages.contains(&deployment.package_ref)
            || !state.revisions.iter().any(|revision| {
                revision.revision_id == deployment.revision_id
                    && revision.package_ref.as_ref() == Some(&deployment.package_ref)
            })
        {
            return Err(fail(
                "invalid_state",
                "deployment lineage or package is invalid",
            ));
        }
        if !state.hosted.as_ref().is_some_and(|hosted| {
            hosted
                .deployment_targets
                .iter()
                .any(|target| target.target_id == deployment.target_id)
        }) {
            return Err(fail("invalid_state", "deployment target is missing"));
        }
        if matches!(
            deployment.status,
            DeploymentStatus::Queued | DeploymentStatus::Running | DeploymentStatus::Uncertain
        ) && !active_targets.insert(deployment.target_id.as_str())
        {
            return Err(fail(
                "invalid_state",
                "target has multiple active deployment jobs",
            ));
        }
        if deployment.status == DeploymentStatus::Succeeded
            && (!deployment.publication_authorized
                || deployment.provider_version_id.is_none()
                || deployment.url.is_none())
        {
            return Err(fail(
                "invalid_state",
                "successful deployment lacks publication facts",
            ));
        }
        if !matches!(
            deployment.status,
            DeploymentStatus::Queued | DeploymentStatus::Failed
        ) && !deployment.publication_authorized
        {
            return Err(fail(
                "invalid_state",
                "deployment progress lacks publication authorization",
            ));
        }
    }
    for observation in &state.runtime_observations {
        validate_text("runtime observation summary", &observation.summary, 1_024)?;
        if !state.deployments.iter().any(|deployment| {
            deployment.deployment_id == observation.deployment_id
                && deployment.status == DeploymentStatus::Succeeded
        }) {
            return Err(fail(
                "invalid_state",
                "runtime observation deployment is invalid",
            ));
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
    principal: Option<&PrincipalContext>,
    now_ms: u64,
    command: &WorldCommand,
) -> Result<(WorldState, WorldCommandResult), CommandError> {
    let result = match command {
        WorldCommand::CreateWorld { .. } | WorldCommand::CreateHostedWorld { .. } => {
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
            if state.hosted.is_some() {
                return Err(fail(
                    "invalid_command",
                    "hosted World requires submitHostedCandidate",
                ));
            }
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
                source_ref: None,
                contract_hash: selected_move.contract_hash.clone(),
                submitted_by: actor.clone(),
                submitted_at_ms: now_ms,
            });
            WorldCommandResult::CandidateSubmitted {
                candidate_id: candidate_id.clone(),
                source_digest,
            }
        }
        WorldCommand::SubmitHostedCandidate {
            move_id,
            candidate_id,
            source,
            source_ref,
            ..
        } => {
            require_actor(actor, &Actor::Implementer, "submit a hosted candidate")?;
            let hosted = state
                .hosted
                .as_ref()
                .ok_or_else(|| fail("invalid_command", "World is not hosted"))?;
            validate_text("candidateId", candidate_id, 128)?;
            validate_source(source)?;
            validate_source_ref(source_ref, &hosted.source_repository)?;
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
                source_ref: Some(source_ref.clone()),
                contract_hash: selected_move.contract_hash.clone(),
                submitted_by: actor.clone(),
                submitted_at_ms: now_ms,
            });
            WorldCommandResult::HostedCandidateSubmitted {
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
            if state.hosted.is_some()
                && principal.map(|context| context.principal_id.as_str()) != Some(verifier_id)
            {
                return Err(fail(
                    "principal_identity_mismatch",
                    "verifierId must match the trusted principal",
                ));
            }
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
            if state.hosted.is_some() {
                return Err(fail(
                    "invalid_command",
                    "hosted World requires completeHostedRun",
                ));
            }
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
                package_ref: None,
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
        WorldCommand::CompleteHostedRun {
            run_id,
            lease_id,
            source_digest,
            contract_hash,
            plan_hash,
            package_ref,
            observations,
            ..
        } => {
            require_actor(actor, &Actor::Verifier, "complete a hosted run")?;
            let aggregate = validate_observations(&state.assay_plan, observations)?;
            let run_index = state
                .runs
                .iter()
                .position(|item| item.run_id == *run_id)
                .ok_or_else(|| fail("not_found", "verification run not found"))?;
            let candidate = state
                .candidates
                .iter()
                .find(|item| item.candidate_id == state.runs[run_index].candidate_id)
                .ok_or_else(|| fail("invalid_state", "run candidate not found"))?;
            if state.runs[run_index].source_digest != *source_digest
                || state.runs[run_index].contract_hash != *contract_hash
                || state.runs[run_index].plan_hash != *plan_hash
            {
                return Err(fail(
                    "binding_mismatch",
                    "completion hashes do not match the pinned run",
                ));
            }
            if let Some(package) = package_ref {
                validate_package_binding(package, &state.runs[run_index], candidate, &state)?;
            } else if aggregate == VerificationAggregate::Ready {
                return Err(fail(
                    "binding_mismatch",
                    "ready hosted completion requires a retained package",
                ));
            }
            let run = &mut state.runs[run_index];
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
            let has_execution_error = observations
                .iter()
                .any(|item| item.execution_status == ExecutionStatus::Error);
            run.evaluations.push(AssayEvaluation {
                verifier_id: lease.verifier_id.clone(),
                attempt: run.attempt,
                source_digest: run.source_digest.clone(),
                contract_hash: run.contract_hash.clone(),
                plan_hash: run.plan_hash.clone(),
                build_digest: package_ref
                    .as_ref()
                    .map(|package| package.build_digest.clone()),
                package_ref: package_ref.clone(),
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
            if !has_execution_error
                && let Some(package) = package_ref
                && !state.retained_packages.contains(package)
            {
                if state.retained_packages.len() >= MAX_RETAINED_PACKAGES {
                    return Err(fail("resource_limit", "retained package limit reached"));
                }
                state.retained_packages.push(package.clone());
            }
            WorldCommandResult::HostedRunCompleted {
                run_id: run_id.clone(),
                aggregate,
                package_digest: package_ref
                    .as_ref()
                    .map(|package| package.package_digest.clone()),
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
            let promotion_package = if state.hosted.is_some() {
                evaluation
                    .package_ref
                    .as_ref()
                    .filter(|package| {
                        state.retained_packages.contains(package)
                            && package.source_digest == candidate.source_digest
                            && package.contract_hash == candidate.contract_hash
                            && package.plan_hash == state.assay_plan.plan_hash
                            && package.run_id == run.run_id
                            && candidate.source_ref.as_ref() == Some(&package.source_ref)
                    })
                    .cloned()
            } else {
                None
            };
            if !evidence_is_current || (state.hosted.is_some() && promotion_package.is_none()) {
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
                package_ref: promotion_package,
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
        WorldCommand::RegisterDeploymentTarget { target, .. } => {
            require_actor(actor, &Actor::Owner, "register a deployment target")?;
            validate_target(target)?;
            let requester = principal.ok_or_else(|| {
                fail(
                    "principal_required",
                    "target registration requires principal",
                )
            })?;
            if target.owner_principal_id != requester.principal_id {
                return Err(fail(
                    "forbidden",
                    "deployment target owner must match the trusted principal",
                ));
            }
            let hosted = state
                .hosted
                .as_mut()
                .ok_or_else(|| fail("invalid_command", "World is not hosted"))?;
            if let Some(existing) = hosted
                .deployment_targets
                .iter()
                .find(|item| item.target_id == target.target_id)
            {
                if existing != target {
                    return Err(fail(
                        "target_binding_conflict",
                        "targetId is already bound to different provider identity",
                    ));
                }
                WorldCommandResult::DeploymentTargetRegistered {
                    target_id: target.target_id.clone(),
                    reused: true,
                }
            } else {
                if hosted.deployment_targets.len() >= MAX_DEPLOYMENT_TARGETS {
                    return Err(fail("resource_limit", "deployment target limit reached"));
                }
                hosted.deployment_targets.push(target.clone());
                WorldCommandResult::DeploymentTargetRegistered {
                    target_id: target.target_id.clone(),
                    reused: false,
                }
            }
        }
        WorldCommand::RequestDeployment {
            deployment_id,
            target_id,
            revision_id,
            expected_head_revision_id,
            ..
        } => {
            require_actor(actor, &Actor::Owner, "request deployment")?;
            validate_text("deploymentId", deployment_id, 128)?;
            if state.deployments.len() >= MAX_DEPLOYMENTS {
                return Err(fail("resource_limit", "deployment limit reached"));
            }
            if state
                .deployments
                .iter()
                .any(|item| item.deployment_id == *deployment_id)
            {
                return Err(fail("duplicate_id", "deploymentId already exists"));
            }
            if state.head_revision_id != *expected_head_revision_id
                || state.head_revision_id != *revision_id
            {
                return Err(fail(
                    "stale_head",
                    "deployment must target the current promoted head",
                ));
            }
            if state.deployments.iter().any(|item| {
                item.target_id == *target_id
                    && matches!(
                        item.status,
                        DeploymentStatus::Queued
                            | DeploymentStatus::Running
                            | DeploymentStatus::Uncertain
                    )
            }) {
                return Err(fail(
                    "deployment_active",
                    "target already has an active job",
                ));
            }
            let hosted = state
                .hosted
                .as_ref()
                .ok_or_else(|| fail("invalid_command", "World is not hosted"))?;
            let target = hosted
                .deployment_targets
                .iter()
                .find(|item| item.target_id == *target_id)
                .ok_or_else(|| fail("not_found", "deployment target not found"))?;
            let requester = principal
                .ok_or_else(|| fail("principal_required", "deployment requires principal"))?;
            if requester.principal_id != target.owner_principal_id {
                return Err(fail(
                    "forbidden",
                    "principal does not own this deployment target",
                ));
            }
            let package_ref = state
                .revisions
                .iter()
                .find(|item| item.revision_id == *revision_id)
                .and_then(|item| item.package_ref.clone())
                .filter(|package| state.retained_packages.contains(package))
                .ok_or_else(|| {
                    fail(
                        "deployment_blocked",
                        "current promoted revision has no retained trusted package",
                    )
                })?;
            let expected_active_provider_version_id = state
                .deployments
                .iter()
                .rev()
                .find(|item| {
                    item.target_id == *target_id && item.status == DeploymentStatus::Succeeded
                })
                .and_then(|item| item.provider_version_id.clone());
            let job_id = format!("job:{deployment_id}");
            state.deployments.push(DeploymentRecord {
                deployment_id: deployment_id.clone(),
                job_id: job_id.clone(),
                target_id: target_id.clone(),
                revision_id: revision_id.clone(),
                package_ref,
                requester_principal_id: requester.principal_id.clone(),
                status: DeploymentStatus::Queued,
                progress_seq: 0,
                publication_authorized: false,
                rollback_of_deployment_id: None,
                expected_head_revision_id: Some(expected_head_revision_id.clone()),
                expected_active_provider_version_id,
                provider_version_id: None,
                url: None,
                failure: None,
                created_at_ms: now_ms,
                updated_at_ms: now_ms,
            });
            WorldCommandResult::DeploymentRequested {
                deployment_id: deployment_id.clone(),
                job_id,
            }
        }
        WorldCommand::RequestRollback {
            deployment_id,
            target_id,
            previous_deployment_id,
            expected_active_provider_version_id,
            ..
        } => {
            require_actor(actor, &Actor::Owner, "request rollback")?;
            validate_text("deploymentId", deployment_id, 128)?;
            if state.deployments.len() >= MAX_DEPLOYMENTS {
                return Err(fail("resource_limit", "deployment limit reached"));
            }
            if state
                .deployments
                .iter()
                .any(|item| item.deployment_id == *deployment_id)
            {
                return Err(fail("duplicate_id", "deploymentId already exists"));
            }
            let target = state
                .hosted
                .as_ref()
                .and_then(|hosted| {
                    hosted
                        .deployment_targets
                        .iter()
                        .find(|item| item.target_id == *target_id)
                })
                .ok_or_else(|| fail("not_found", "deployment target not found"))?;
            let requester = principal
                .ok_or_else(|| fail("principal_required", "rollback requires principal"))?;
            if requester.principal_id != target.owner_principal_id {
                return Err(fail(
                    "forbidden",
                    "principal does not own this deployment target",
                ));
            }
            if state.deployments.iter().any(|item| {
                item.target_id == *target_id
                    && matches!(
                        item.status,
                        DeploymentStatus::Queued
                            | DeploymentStatus::Running
                            | DeploymentStatus::Uncertain
                    )
            }) {
                return Err(fail(
                    "deployment_active",
                    "target already has an active job",
                ));
            }
            let active_provider = state
                .deployments
                .iter()
                .rev()
                .find(|item| {
                    item.target_id == *target_id && item.status == DeploymentStatus::Succeeded
                })
                .and_then(|item| item.provider_version_id.as_deref());
            if active_provider != Some(expected_active_provider_version_id.as_str()) {
                return Err(fail(
                    "stale_provider_version",
                    "active provider version changed",
                ));
            }
            let previous = state
                .deployments
                .iter()
                .find(|item| {
                    item.deployment_id == *previous_deployment_id
                        && item.target_id == *target_id
                        && item.status == DeploymentStatus::Succeeded
                })
                .cloned()
                .ok_or_else(|| {
                    fail(
                        "rollback_blocked",
                        "previous deployment is not a successful target version",
                    )
                })?;
            let job_id = format!("job:{deployment_id}");
            state.deployments.push(DeploymentRecord {
                deployment_id: deployment_id.clone(),
                job_id: job_id.clone(),
                target_id: target_id.clone(),
                revision_id: previous.revision_id,
                package_ref: previous.package_ref,
                requester_principal_id: requester.principal_id.clone(),
                status: DeploymentStatus::Queued,
                progress_seq: 0,
                publication_authorized: false,
                rollback_of_deployment_id: Some(previous_deployment_id.clone()),
                expected_head_revision_id: None,
                expected_active_provider_version_id: Some(
                    expected_active_provider_version_id.clone(),
                ),
                provider_version_id: None,
                url: None,
                failure: None,
                created_at_ms: now_ms,
                updated_at_ms: now_ms,
            });
            WorldCommandResult::RollbackRequested {
                deployment_id: deployment_id.clone(),
                job_id,
            }
        }
        WorldCommand::AuthorizeDeploymentPublication {
            deployment_id,
            progress_seq,
            ..
        } => {
            if !matches!(actor, Actor::Deployer | Actor::System) {
                return Err(fail(
                    "forbidden",
                    "only the protected deployment adapter can authorize publication",
                ));
            }
            let deployment_index = state
                .deployments
                .iter()
                .position(|item| item.deployment_id == *deployment_id)
                .ok_or_else(|| fail("not_found", "deployment not found"))?;
            let deployment = &state.deployments[deployment_index];
            if *progress_seq <= deployment.progress_seq {
                return Err(fail(
                    "stale_progress",
                    "deployment progress must increase monotonically",
                ));
            }
            if deployment.status != DeploymentStatus::Queued {
                return Err(fail(
                    "invalid_transition",
                    "only a queued deployment can authorize publication",
                ));
            }
            if let Some(expected_head) = &deployment.expected_head_revision_id
                && (state.head_revision_id != *expected_head
                    || deployment.revision_id != state.head_revision_id)
            {
                return Err(fail(
                    "stale_head",
                    "canonical head changed before publication",
                ));
            }
            if let Some(expected_provider) = &deployment.expected_active_provider_version_id {
                let active_provider = state
                    .deployments
                    .iter()
                    .rev()
                    .find(|item| {
                        item.target_id == deployment.target_id
                            && item.status == DeploymentStatus::Succeeded
                    })
                    .and_then(|item| item.provider_version_id.as_deref());
                if active_provider != Some(expected_provider.as_str()) {
                    return Err(fail(
                        "stale_provider_version",
                        "active provider version changed before rollback publication",
                    ));
                }
            }
            let deployment = &mut state.deployments[deployment_index];
            deployment.publication_authorized = true;
            deployment.status = DeploymentStatus::Running;
            deployment.progress_seq = *progress_seq;
            deployment.updated_at_ms = now_ms;
            WorldCommandResult::DeploymentPublicationAuthorized {
                deployment_id: deployment_id.clone(),
            }
        }
        WorldCommand::UpdateDeployment {
            deployment_id,
            progress_seq,
            status,
            provider_version_id,
            url,
            failure,
            ..
        } => {
            if !matches!(actor, Actor::Deployer | Actor::System) {
                return Err(fail(
                    "forbidden",
                    "only the protected deployment adapter can update deployment progress",
                ));
            }
            if *status == DeploymentStatus::Queued {
                return Err(fail(
                    "invalid_transition",
                    "adapter cannot return a deployment to queued",
                ));
            }
            let deployment = state
                .deployments
                .iter_mut()
                .find(|item| item.deployment_id == *deployment_id)
                .ok_or_else(|| fail("not_found", "deployment not found"))?;
            if *progress_seq <= deployment.progress_seq {
                return Err(fail(
                    "stale_progress",
                    "deployment progress must increase monotonically",
                ));
            }
            if matches!(
                deployment.status,
                DeploymentStatus::Succeeded | DeploymentStatus::Failed
            ) {
                return Err(fail(
                    "invalid_transition",
                    "terminal deployment cannot be updated",
                ));
            }
            let queued_failure = deployment.status == DeploymentStatus::Queued
                && *status == DeploymentStatus::Failed;
            if !deployment.publication_authorized && !queued_failure {
                return Err(fail(
                    "publication_not_authorized",
                    "deployment publication has not been authorized",
                ));
            }
            match status {
                DeploymentStatus::Succeeded => {
                    let provider = provider_version_id.as_ref().ok_or_else(|| {
                        fail(
                            "invalid_input",
                            "successful deployment requires providerVersionId",
                        )
                    })?;
                    let deployed_url = url.as_ref().ok_or_else(|| {
                        fail("invalid_input", "successful deployment requires url")
                    })?;
                    validate_text("providerVersionId", provider, 256)?;
                    validate_text("url", deployed_url, 2_048)?;
                }
                DeploymentStatus::Failed => {
                    validate_text("failure", failure.as_deref().unwrap_or_default(), 1_024)?;
                }
                DeploymentStatus::Running | DeploymentStatus::Uncertain => {}
                DeploymentStatus::Queued => unreachable!(),
            }
            deployment.status = status.clone();
            deployment.progress_seq = *progress_seq;
            if let Some(provider_version_id) = provider_version_id {
                deployment.provider_version_id = Some(provider_version_id.clone());
            }
            if let Some(url) = url {
                deployment.url = Some(url.clone());
            }
            if let Some(failure) = failure {
                deployment.failure = Some(failure.clone());
            }
            deployment.updated_at_ms = now_ms;
            WorldCommandResult::DeploymentUpdated {
                deployment_id: deployment_id.clone(),
                status: status.clone(),
            }
        }
        WorldCommand::RecordRuntimeObservation {
            deployment_id,
            healthy,
            summary,
            ..
        } => {
            if !matches!(actor, Actor::Deployer | Actor::System) {
                return Err(fail(
                    "forbidden",
                    "only the protected deployment adapter can record runtime observations",
                ));
            }
            validate_text("runtime observation summary", summary, 1_024)?;
            if state.runtime_observations.len() >= MAX_RUNTIME_OBSERVATIONS {
                return Err(fail("resource_limit", "runtime observation limit reached"));
            }
            let deployment = state
                .deployments
                .iter()
                .find(|item| {
                    item.deployment_id == *deployment_id
                        && item.status == DeploymentStatus::Succeeded
                })
                .ok_or_else(|| fail("not_found", "published deployment not found"))?;
            let observation_id = format!(
                "observation:{}",
                &hash(&(deployment_id, now_ms, healthy, summary))?[..32]
            );
            state.runtime_observations.push(RuntimeObservation {
                observation_id: observation_id.clone(),
                deployment_id: deployment.deployment_id.clone(),
                healthy: *healthy,
                summary: summary.clone(),
                observed_at_ms: now_ms,
            });
            WorldCommandResult::RuntimeObservationRecorded { observation_id }
        }
    };
    Ok((state, result))
}

#[allow(clippy::too_many_lines)]
fn execute(request: WorldCommandRequest) -> Result<(WorldState, WorldCommandResult), CommandError> {
    if request.api_version != 1 {
        return Err(fail(
            "unsupported_api_version",
            format!("unsupported apiVersion {}; expected 1", request.api_version),
        ));
    }
    validate_text("requestId", request.command.request_id(), 128)?;
    let command_world_id = match &request.command {
        WorldCommand::CreateWorld { world_id, .. }
        | WorldCommand::CreateHostedWorld { world_id, .. } => Some(world_id.as_str()),
        _ => request
            .state
            .as_deref()
            .map(|state| state.world_id.as_str()),
    };
    let hosted_command = matches!(request.command, WorldCommand::CreateHostedWorld { .. })
        || request
            .state
            .as_deref()
            .is_some_and(|state| state.hosted.is_some());
    if hosted_command {
        validate_principal(
            request.principal.as_ref(),
            &request.actor,
            request.now_ms,
            command_world_id.unwrap_or_default(),
            request.state.as_deref(),
            &request.command,
        )?;
    }
    let command_hash = if let Some(principal) = &request.principal {
        hash(&(
            &request.actor,
            principal.principal_id.as_str(),
            &request.command,
        ))?
    } else {
        // Preserve the v1 local receipt hash so old stored states replay exactly.
        hash(&(&request.actor, &request.command))?
    };
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
        (
            None,
            WorldCommand::CreateHostedWorld {
                world_id,
                title,
                runner_hash,
                source_repository,
                deployment_targets,
                ..
            },
        ) => initial_hosted_state(
            &request.actor,
            request.now_ms,
            world_id.clone(),
            title.clone(),
            runner_hash,
            source_repository.clone(),
            deployment_targets.clone(),
        )?,
        (None, _) => return Err(fail("missing_state", "this command requires World state")),
        (Some(state), _) => apply_command(
            *state,
            &request.actor,
            request.principal.as_ref(),
            request.now_ms,
            &request.command,
        )?,
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
        PrincipalContext,
        ArtifactSourceRef,
        SourceRepository,
        RetainedPackageRef,
        DeploymentTarget,
        HostedWorldConfig,
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
        DeploymentStatus,
        DeploymentRecord,
        RuntimeObservation,
        IdempotencyReceipt,
        WorldState,
        WorldCommand,
        WorldCommandRequest,
        WorldCommandResult,
        WorldCommandResponse,
    )
}
