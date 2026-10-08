#![allow(clippy::needless_pass_by_value)]

use bropilot_core::{ReadinessStatus, WorldSnapshot, evaluate_readiness};
use serde_json::{Value, json};

const RUNNER_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BUILD_DIGEST: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

#[test]
fn source_bundle_obeys_shared_verifier_contract() {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/source-contract.json")).unwrap();
    let mut cases = corpus["cases"].as_array().unwrap().clone();
    for count in [64, 65] {
        let files: serde_json::Map<String, Value> = (0..count)
            .map(|index| (format!("file-{index}.ts"), json!("")))
            .collect();
        cases.push(json!({"name":format!("{count} files"),"files":files,"valid":count == 64}));
    }
    let long_path = "a".repeat(257);
    cases.push(json!({"name":"path length","files":{long_path:""},"valid":false}));
    cases.push(
        json!({"name":"exact byte limit","files":{"worker.ts":"x".repeat(65536 - 9)},"valid":true}),
    );
    cases.push(
        json!({"name":"path bytes count","files":{"worker.ts":"x".repeat(65536)},"valid":false}),
    );
    for item in cases {
        let (state, _) = create_world("corpus-create");
        let move_id = state["moves"][0]["moveId"].clone();
        let response = invoke(
            Some(state),
            "implementer",
            2_000,
            json!({
                "kind":"submitCandidate", "moveId":move_id, "candidateId":"corpus",
                "source":{"files":item["files"]}, "requestId":"corpus-submit"
            }),
        );
        assert_eq!(
            response["status"] == "ok",
            item["valid"].as_bool().unwrap(),
            "{}: {}",
            item["name"],
            response["status"]
        );
    }
}

fn invoke(state: Option<Value>, actor: &str, now_ms: u64, command: Value) -> Value {
    let request = json!({
        "apiVersion": 1,
        "state": state,
        "actor": actor,
        "nowMs": now_ms,
        "command": command,
    });
    serde_json::from_str(&bropilot_core::handle_world_command(&request.to_string()))
        .expect("world command returns JSON")
}

fn ok(response: Value) -> (Value, Value) {
    assert_eq!(response["status"], "ok", "{response:#}");
    (response["state"].clone(), response["result"].clone())
}

fn assert_error(response: Value, code: &str) {
    assert_eq!(response["status"], "error", "{response:#}");
    assert_eq!(response["code"], code, "{response:#}");
}

fn create_world(request_id: &str) -> (Value, Value) {
    ok(invoke(
        None,
        "owner",
        1_000,
        json!({
            "kind": "createWorld",
            "worldId": "world-1",
            "title": "Worker app",
            "runnerHash": RUNNER_HASH,
            "requestId": request_id,
        }),
    ))
}

fn submit_candidate(state: Value, candidate_id: &str, request_id: &str) -> (Value, Value) {
    let move_id = state["moves"][0]["moveId"].as_str().expect("initial move");
    ok(invoke(
        Some(state.clone()),
        "implementer",
        2_000,
        json!({
            "kind": "submitCandidate",
            "moveId": move_id,
            "candidateId": candidate_id,
            "source": {"files": {
                "public/index.html": "<!doctype html><title>World</title>",
                "worker.ts": "export default { fetch() { return new Response('ok') } }",
            }},
            "requestId": request_id,
        }),
    ))
}

fn start_and_claim(state: Value, candidate_id: &str, prefix: &str) -> (Value, String, String) {
    let (state, started) = ok(invoke(
        Some(state),
        "owner",
        3_000,
        json!({
            "kind": "startVerification",
            "candidateId": candidate_id,
            "requestId": format!("{prefix}-start"),
        }),
    ));
    let run_id = started["runId"].as_str().expect("run id").to_owned();
    let lease_id = format!("{prefix}-lease");
    let (state, claimed) = ok(invoke(
        Some(state),
        "verifier",
        4_000,
        json!({
            "kind": "claimRun",
            "runId": run_id,
            "leaseId": lease_id,
            "verifierId": "verifier-1",
            "runnerHash": RUNNER_HASH,
            "requestId": format!("{prefix}-claim"),
        }),
    ));
    assert_eq!(claimed["attempt"], 1);
    (state, run_id, lease_id)
}

fn passing_observations() -> Value {
    json!([
        {"assayId":"artifact.exists","executionStatus":"completed","result":"pass","summary":"required files resolved","raw":"worker.ts\npublic/index.html"},
        {"assayId":"artifact.build-start","executionStatus":"completed","result":"pass","summary":"built and started","raw":"exit 0"},
        {"assayId":"app.health","executionStatus":"completed","result":"pass","summary":"health contract matched","raw":"200 {\"status\":\"ok\"}"},
        {"assayId":"app.surfaces","executionStatus":"completed","result":"pass","summary":"frontend and API matched","raw":"200 html; 200 message"},
    ])
}

fn complete(
    state: Value,
    run_id: &str,
    lease_id: &str,
    observations: Value,
    request_id: &str,
) -> (Value, Value) {
    let run = state["runs"]
        .as_array()
        .expect("runs")
        .iter()
        .find(|run| run["runId"] == run_id)
        .expect("run");
    ok(invoke(
        Some(state.clone()),
        "verifier",
        5_000,
        json!({
            "kind": "completeRun",
            "runId": run_id,
            "leaseId": lease_id,
            "sourceDigest": run["sourceDigest"],
            "contractHash": run["contractHash"],
            "planHash": run["planHash"],
            "buildDigest": BUILD_DIGEST,
            "observations": observations,
            "requestId": request_id,
        }),
    ))
}

#[test]
fn valid_candidate_is_verified_and_promoted_against_the_expected_head() {
    let (state, created) = create_world("create-1");
    assert_eq!(created["kind"], "worldCreated");
    assert_eq!(state["desired"]["things"][0]["id"], "web-app");
    assert_eq!(state["kit"]["entrypoint"], "worker.ts");
    assert_eq!(state["kit"]["requiredAsset"], "public/index.html");
    assert_eq!(state["assayPlan"]["assays"].as_array().unwrap().len(), 4);

    let initial_head = state["headRevisionId"].clone();
    let (state, submitted) = submit_candidate(state, "candidate-a", "submit-a");
    assert_eq!(submitted["kind"], "candidateSubmitted");
    let (state, run_id, lease_id) = start_and_claim(state, "candidate-a", "a");
    let (state, completed) = complete(
        state,
        &run_id,
        &lease_id,
        passing_observations(),
        "complete-a",
    );
    assert_eq!(completed["aggregate"], "ready");

    let (state, promoted) = ok(invoke(
        Some(state),
        "owner",
        6_000,
        json!({
            "kind": "promote",
            "candidateId": "candidate-a",
            "expectedHeadRevisionId": initial_head,
            "requestId": "promote-a",
        }),
    ));
    assert_eq!(promoted["kind"], "candidatePromoted");
    assert_eq!(state["headRevisionId"], promoted["revisionId"]);
    assert_eq!(state["revisions"].as_array().unwrap().len(), 2);
}

#[test]
fn created_desired_snapshot_is_ready_hierarchical_and_covers_four_criteria() {
    let (state, _) = create_world("create-model");
    let snapshot: WorldSnapshot =
        serde_json::from_value(state["desired"].clone()).expect("desired snapshot contract");

    let readiness = evaluate_readiness(&snapshot).expect("desired model evaluates");
    assert_eq!(
        readiness.status,
        ReadinessStatus::Ready,
        "{:#?}",
        readiness.findings
    );
    assert!(readiness.findings.is_empty());
    assert_eq!(readiness.outcome_assessments.len(), 1);
    assert_eq!(readiness.outcome_assessments[0].status, "unknown");

    let root = snapshot
        .objects
        .iter()
        .find(|object| object.id == "world-1")
        .expect("matching World root");
    assert!(root.parent_id.is_none());
    let thing_node = snapshot
        .objects
        .iter()
        .find(|object| object.kind == "thing" && object.thing_id.as_deref() == Some("web-app"))
        .expect("web-app Thing hierarchy node");
    assert_eq!(thing_node.parent_id.as_deref(), Some("world-1"));

    let criteria = snapshot
        .objects
        .iter()
        .filter(|object| object.kind == "acceptanceCriterion")
        .collect::<Vec<_>>();
    assert_eq!(criteria.len(), 4);
    for criterion in criteria {
        let assay_id = snapshot
            .relations
            .iter()
            .find(|relation| relation.kind == "verifiedBy" && relation.from_id == criterion.id)
            .map(|relation| relation.to_id.as_str())
            .expect("criterion links to protected Assay");
        let assay = snapshot
            .objects
            .iter()
            .find(|object| object.id == assay_id && object.kind == "assay")
            .expect("linked Assay object");
        assert_eq!(
            assay.properties.get("runnerHash").map(String::as_str),
            Some(RUNNER_HASH)
        );
        assert!(assay.source.reference.starts_with("protected:assay-plan:"));
        assert!(
            snapshot
                .relations
                .iter()
                .any(|relation| { relation.kind == "executedBy" && relation.from_id == assay.id })
        );
    }
}

#[test]
fn roles_and_request_ids_are_enforced_without_mutating_state() {
    assert_error(
        invoke(
            None,
            "implementer",
            1,
            json!({"kind":"createWorld","worldId":"w","title":"W","runnerHash":RUNNER_HASH,"requestId":"x"}),
        ),
        "forbidden",
    );
    let (state, _) = create_world("same-id");
    let replay = invoke(
        Some(state.clone()),
        "owner",
        9_999,
        json!({"kind":"createWorld","worldId":"world-1","title":"Worker app","runnerHash":RUNNER_HASH,"requestId":"same-id"}),
    );
    let (replayed_state, replayed_result) = ok(replay);
    assert_eq!(replayed_state, state);
    assert_eq!(replayed_result["kind"], "worldCreated");

    assert_error(
        invoke(
            Some(state),
            "owner",
            2_000,
            json!({"kind":"createMove","moveId":"other","title":"Other","requestId":"same-id"}),
        ),
        "idempotency_conflict",
    );
}

#[test]
fn exact_hashes_lease_and_complete_assay_set_are_required() {
    let (state, _) = create_world("create-hashes");
    let (state, _) = submit_candidate(state, "candidate-hashes", "submit-hashes");
    let (state, run_id, lease_id) = start_and_claim(state, "candidate-hashes", "hashes");
    let run = state["runs"][0].clone();

    assert_error(
        invoke(
            Some(state.clone()),
            "verifier",
            5_000,
            json!({
                "kind":"completeRun","runId":run_id,"leaseId":"wrong",
                "sourceDigest":run["sourceDigest"],"contractHash":run["contractHash"],
                "planHash":run["planHash"],"buildDigest":BUILD_DIGEST,
                "observations":passing_observations(),"requestId":"wrong-lease"
            }),
        ),
        "lease_mismatch",
    );
    assert_error(
        invoke(
            Some(state.clone()),
            "verifier",
            5_000,
            json!({
                "kind":"completeRun","runId":run_id,"leaseId":lease_id,
                "sourceDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                "contractHash":run["contractHash"],"planHash":run["planHash"],
                "buildDigest":BUILD_DIGEST,"observations":passing_observations(),
                "requestId":"wrong-digest"
            }),
        ),
        "binding_mismatch",
    );
    let incomplete = json!([
        {"assayId":"artifact.exists","executionStatus":"completed","result":"pass","summary":"ok"}
    ]);
    assert_error(
        invoke(
            Some(state),
            "verifier",
            5_000,
            json!({
                "kind":"completeRun","runId":run_id,"leaseId":lease_id,
                "sourceDigest":run["sourceDigest"],"contractHash":run["contractHash"],
                "planHash":run["planHash"],"buildDigest":BUILD_DIGEST,
                "observations":incomplete,"requestId":"incomplete"
            }),
        ),
        "invalid_observations",
    );
}

#[test]
fn failed_and_unknown_assertions_cannot_be_promoted() {
    let (state, _) = create_world("create-failed");
    let head = state["headRevisionId"].clone();
    let (state, _) = submit_candidate(state, "candidate-failed", "submit-failed");
    let (state, run_id, lease_id) = start_and_claim(state, "candidate-failed", "failed");
    let observations = json!([
        {"assayId":"artifact.exists","executionStatus":"completed","result":"fail","summary":"worker.ts absent"},
        {"assayId":"artifact.build-start","executionStatus":"notRun","result":"unknown","summary":"inspection failed"},
        {"assayId":"app.health","executionStatus":"notRun","result":"unknown","summary":"inspection failed"},
        {"assayId":"app.surfaces","executionStatus":"notRun","result":"unknown","summary":"inspection failed"}
    ]);
    let (state, completed) = complete(state, &run_id, &lease_id, observations, "failed-complete");
    assert_eq!(completed["aggregate"], "blocked");
    assert_error(
        invoke(
            Some(state),
            "owner",
            6_000,
            json!({"kind":"promote","candidateId":"candidate-failed","expectedHeadRevisionId":head,"requestId":"failed-promote"}),
        ),
        "promotion_blocked",
    );
}

#[test]
fn expired_and_infrastructure_error_runs_reclaim_the_same_identity() {
    let (state, _) = create_world("create-retry");
    let (state, _) = submit_candidate(state, "candidate-retry", "submit-retry");
    let (state, started) = ok(invoke(
        Some(state),
        "owner",
        3_000,
        json!({"kind":"startVerification","candidateId":"candidate-retry","requestId":"retry-start"}),
    ));
    let run_id = started["runId"].as_str().unwrap();
    let (state, _) = ok(invoke(
        Some(state),
        "verifier",
        4_000,
        json!({"kind":"claimRun","runId":run_id,"leaseId":"expired","verifierId":"verifier-1","runnerHash":RUNNER_HASH,"requestId":"claim-expired"}),
    ));
    let (state, reclaimed) = ok(invoke(
        Some(state),
        "verifier",
        124_001,
        json!({"kind":"claimRun","runId":run_id,"leaseId":"retry","verifierId":"verifier-2","runnerHash":RUNNER_HASH,"requestId":"reclaim"}),
    ));
    assert_eq!(reclaimed["attempt"], 2);

    let run = state["runs"][0].clone();
    let errored = json!([
        {"assayId":"artifact.exists","executionStatus":"error","result":"unknown","summary":"repository unavailable"},
        {"assayId":"artifact.build-start","executionStatus":"notRun","result":"unknown","summary":"prerequisite unresolved"},
        {"assayId":"app.health","executionStatus":"notRun","result":"unknown","summary":"prerequisite unresolved"},
        {"assayId":"app.surfaces","executionStatus":"notRun","result":"unknown","summary":"prerequisite unresolved"}
    ]);
    let (state, result) = ok(invoke(
        Some(state),
        "verifier",
        125_000,
        json!({"kind":"completeRun","runId":run_id,"leaseId":"retry","sourceDigest":run["sourceDigest"],"contractHash":run["contractHash"],"planHash":run["planHash"],"buildDigest":null,"observations":errored,"requestId":"error-complete"}),
    ));
    assert_eq!(result["aggregate"], "unknown");
    assert_eq!(state["runs"][0]["status"], "error");
    let (_, reclaimed) = ok(invoke(
        Some(state),
        "verifier",
        126_000,
        json!({"kind":"claimRun","runId":run_id,"leaseId":"after-error","verifierId":"verifier-3","runnerHash":RUNNER_HASH,"requestId":"after-error-claim"}),
    ));
    assert_eq!(reclaimed["attempt"], 3);
}

#[test]
fn competing_candidate_cannot_promote_from_a_stale_move_base() {
    let (state, _) = create_world("create-race");
    let original_head = state["headRevisionId"].clone();
    let (state, _) = submit_candidate(state, "candidate-a", "race-submit-a");
    let (state, _) = submit_candidate(state, "candidate-b", "race-submit-b");
    let (state, run_a, lease_a) = start_and_claim(state, "candidate-a", "race-a");
    let (state, _) = complete(
        state,
        &run_a,
        &lease_a,
        passing_observations(),
        "race-complete-a",
    );
    let (state, run_b, lease_b) = start_and_claim(state, "candidate-b", "race-b");
    let (state, _) = complete(
        state,
        &run_b,
        &lease_b,
        passing_observations(),
        "race-complete-b",
    );
    let (state, _) = ok(invoke(
        Some(state),
        "owner",
        6_000,
        json!({"kind":"promote","candidateId":"candidate-a","expectedHeadRevisionId":original_head,"requestId":"race-promote-a"}),
    ));
    assert_error(
        invoke(
            Some(state),
            "owner",
            7_000,
            json!({"kind":"promote","candidateId":"candidate-b","expectedHeadRevisionId":original_head,"requestId":"race-promote-b"}),
        ),
        "stale_head",
    );
}

#[test]
fn source_hashing_is_order_independent_and_resource_bounds_are_enforced() {
    let (state, _) = create_world("create-bounds");
    let move_id = state["moves"][0]["moveId"].clone();
    let first = ok(invoke(
        Some(state.clone()), "implementer", 2_000,
        json!({"kind":"submitCandidate","moveId":move_id,"candidateId":"ordered-a","source":{"files":{"worker.ts":"w","public/index.html":"h"}},"requestId":"ordered-a"}),
    )).1;
    let second = ok(invoke(
        Some(state.clone()), "implementer", 2_000,
        json!({"kind":"submitCandidate","moveId":move_id,"candidateId":"ordered-b","source":{"files":{"public/index.html":"h","worker.ts":"w"}},"requestId":"ordered-b"}),
    )).1;
    assert_eq!(first["sourceDigest"], second["sourceDigest"]);

    let too_many_files = (0..65)
        .map(|index| (format!("file-{index}.txt"), Value::String("x".into())))
        .collect::<serde_json::Map<_, _>>();
    assert_error(
        invoke(
            Some(state),
            "implementer",
            2_000,
            json!({"kind":"submitCandidate","moveId":move_id,"candidateId":"too-many","source":{"files":too_many_files},"requestId":"too-many"}),
        ),
        "resource_limit",
    );
}

#[test]
fn wrong_runner_and_missing_build_digest_block_trust_and_promotion() {
    let (state, _) = create_world("create-trust");
    let head = state["headRevisionId"].clone();
    let (state, _) = submit_candidate(state, "candidate-trust", "submit-trust");
    let (state, started) = ok(invoke(
        Some(state),
        "owner",
        3_000,
        json!({"kind":"startVerification","candidateId":"candidate-trust","requestId":"trust-start"}),
    ));
    let run_id = started["runId"].as_str().unwrap();
    assert_error(
        invoke(
            Some(state.clone()),
            "implementer",
            4_000,
            json!({"kind":"claimRun","runId":run_id,"leaseId":"forged-role","verifierId":"verifier-1","runnerHash":RUNNER_HASH,"requestId":"forged-role"}),
        ),
        "forbidden",
    );
    assert_error(
        invoke(
            Some(state.clone()),
            "verifier",
            4_000,
            json!({"kind":"claimRun","runId":run_id,"leaseId":"bad-runner","verifierId":"verifier-1","runnerHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","requestId":"bad-runner"}),
        ),
        "runner_mismatch",
    );
    let (state, _) = ok(invoke(
        Some(state),
        "verifier",
        4_000,
        json!({"kind":"claimRun","runId":run_id,"leaseId":"trust-lease","verifierId":"verifier-1","runnerHash":RUNNER_HASH,"requestId":"trust-claim"}),
    ));
    let run = state["runs"][0].clone();
    let (state, _) = ok(invoke(
        Some(state),
        "verifier",
        5_000,
        json!({"kind":"completeRun","runId":run_id,"leaseId":"trust-lease","sourceDigest":run["sourceDigest"],"contractHash":run["contractHash"],"planHash":run["planHash"],"buildDigest":null,"observations":passing_observations(),"requestId":"trust-complete"}),
    ));
    assert_error(
        invoke(
            Some(state),
            "owner",
            6_000,
            json!({"kind":"promote","candidateId":"candidate-trust","expectedHeadRevisionId":head,"requestId":"trust-promote"}),
        ),
        "promotion_blocked",
    );
}

#[test]
fn tampered_source_and_unsafe_paths_are_rejected() {
    let (state, _) = create_world("create-tamper");
    let move_id = state["moves"][0]["moveId"].clone();
    assert_error(
        invoke(
            Some(state.clone()),
            "implementer",
            2_000,
            json!({"kind":"submitCandidate","moveId":move_id,"candidateId":"unsafe","source":{"files":{"../worker.ts":"x"}},"requestId":"unsafe"}),
        ),
        "invalid_source_path",
    );
    let (mut state, _) = submit_candidate(state, "candidate-tamper", "submit-tamper");
    let move_id = state["moves"][0]["moveId"].clone();
    assert_error(
        invoke(
            Some(state.clone()),
            "implementer",
            2_001,
            json!({"kind":"submitCandidate","moveId":move_id,"candidateId":"candidate-tamper","source":{"files":{"worker.ts":"x"}},"requestId":"duplicate-candidate"}),
        ),
        "duplicate_id",
    );
    state["candidates"][0]["source"]["files"]["worker.ts"] = json!("changed");
    assert_error(
        invoke(
            Some(state),
            "owner",
            3_000,
            json!({"kind":"startVerification","candidateId":"candidate-tamper","requestId":"tampered-start"}),
        ),
        "invalid_state",
    );
}

#[test]
fn oversized_requests_and_states_are_rejected_before_execution() {
    let oversized = format!("{{\"padding\":\"{}\"}}", "x".repeat(1_048_577));
    let response: Value = serde_json::from_str(&bropilot_core::handle_world_command(&oversized))
        .expect("bounded error response");
    assert_error(response, "resource_limit");

    let (mut state, _) = create_world("create-state-bound");
    let receipt = state["receipts"][0].clone();
    state["receipts"] = Value::Array((0..129).map(|_| receipt.clone()).collect());
    assert_error(
        invoke(
            Some(state),
            "owner",
            2_000,
            json!({"kind":"createMove","moveId":"bounded","title":"Bounded","requestId":"state-bound"}),
        ),
        "resource_limit",
    );
}
