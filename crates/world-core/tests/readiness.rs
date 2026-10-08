use bropilot_core::{
    CompletenessDeclaration, CompletenessStatus, CoreRequest, CoreResponse, Query, ReadinessStatus,
    RulePackPin, Source, SourceKind, VersionRef, evaluate_readiness, fixtures, handle_request,
};

#[test]
fn valid_model_is_ready_while_future_outcomes_stay_unknown() {
    let snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert_eq!(evaluation.status, ReadinessStatus::Ready);
    assert!(evaluation.findings.is_empty());
    assert_eq!(evaluation.outcome_assessments.len(), 1);
    assert_eq!(evaluation.outcome_assessments[0].status, "unknown");
}

#[test]
fn compiled_rule_pack_catalog_rejects_unknown_missing_and_wrong_versions() {
    let original = fixtures::snapshot("assistant-valid").expect("fixture exists");

    let mut missing = original.clone();
    missing
        .rule_packs
        .retain(|pack| pack.id != "assistant-foundation");
    let missing_evaluation = evaluate_readiness(&missing).expect("evaluation succeeds");
    assert!(
        missing_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.required-rule-packs")
    );

    let mut unknown = original.clone();
    unknown.rule_packs.push(RulePackPin {
        id: "caller-invented".into(),
        version: "999".into(),
    });
    let unknown_evaluation = evaluate_readiness(&unknown).expect("evaluation succeeds");
    assert!(
        unknown_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.compiled-rule-packs")
    );

    let mut wrong_version = original;
    wrong_version
        .rule_packs
        .iter_mut()
        .find(|pack| pack.id == "assistant-foundation")
        .expect("assistant pack")
        .version = "2".into();
    let wrong_evaluation = evaluate_readiness(&wrong_version).expect("evaluation succeeds");
    assert!(
        wrong_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.compiled-rule-packs")
    );
}

#[test]
fn thing_template_references_resolve_and_inherit_compatible_world_context() {
    let original = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let mut missing = original.clone();
    missing.things[0].template_ref = VersionRef {
        id: "missing-template".into(),
        version: "1".into(),
    };
    let missing_evaluation = evaluate_readiness(&missing).expect("evaluation succeeds");
    assert!(
        missing_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.thing-template-resolves")
    );

    let mut incompatible = original.clone();
    incompatible.thing_templates[0].compatible_world_templates = vec![VersionRef {
        id: "different-world".into(),
        version: "1".into(),
    }];
    let incompatible_evaluation = evaluate_readiness(&incompatible).expect("evaluation succeeds");
    assert!(
        incompatible_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.thing-template-compatible")
    );

    let mut no_inheritance = original;
    no_inheritance.thing_templates[0].inherits_world_context = false;
    let inheritance_evaluation = evaluate_readiness(&no_inheritance).expect("evaluation succeeds");
    assert!(
        inheritance_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.thing-template-inherits-context")
    );
}

#[test]
fn readiness_identity_hashes_actual_snapshot_and_template_content() {
    let original = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let mut changed_fact = original.clone();
    changed_fact.title = "Changed content under the same revision label".into();
    let mut changed_template = original.clone();
    changed_template.template.object_shapes[0].id = "shape:world@changed".into();

    let baseline = evaluate_readiness(&original).expect("baseline evaluates");
    let fact_change = evaluate_readiness(&changed_fact).expect("fact change evaluates");
    let template_change = evaluate_readiness(&changed_template).expect("template change evaluates");

    assert_ne!(baseline.snapshot_hash, fact_change.snapshot_hash);
    assert_eq!(baseline.template_hash, fact_change.template_hash);
    assert_ne!(baseline.snapshot_hash, template_change.snapshot_hash);
    assert_ne!(baseline.template_hash, template_change.template_hash);
    assert_eq!(baseline.evaluator_version, "bropilot-readiness@1");
}

#[test]
fn incomplete_or_duplicate_mandatory_scopes_cannot_be_ready_even_when_links_exist() {
    let original = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let mut incomplete = original.clone();
    incomplete
        .completeness
        .iter_mut()
        .find(|scope| scope.scope_id == "outcome-links")
        .expect("outcome scope")
        .status = CompletenessStatus::Incomplete;
    let incomplete_evaluation = evaluate_readiness(&incomplete).expect("evaluation succeeds");
    assert_eq!(incomplete_evaluation.status, ReadinessStatus::Unknown);
    assert!(
        incomplete_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.mandatory-scope-incomplete")
    );

    let mut duplicate = original;
    duplicate.completeness.push(CompletenessDeclaration {
        scope_id: "outcome-links".into(),
        status: CompletenessStatus::Incomplete,
        source: Source {
            kind: SourceKind::Proposal,
            reference: "test:conflicting-scope".into(),
        },
    });
    let duplicate_evaluation = evaluate_readiness(&duplicate).expect("evaluation succeeds");
    assert_eq!(duplicate_evaluation.status, ReadinessStatus::Blocked);
    assert!(
        duplicate_evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.completeness-declarations-unique")
    );
}

#[test]
fn semantic_references_require_their_declared_kinds() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot.purpose.beneficiary_ids = vec!["outcome-1".into()];
    snapshot.purpose.outcome_ids = vec!["user".into()];
    snapshot.theory.claims[0].indicator_ids = vec!["user".into()];
    snapshot.theory.claims[0].evaluation_ids = vec!["user".into()];

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
    assert!(
        evaluation
            .findings
            .iter()
            .filter(|finding| finding.rule_id == "core.typed-references")
            .count()
            >= 4
    );
}

#[test]
fn assistant_fixture_models_capabilities_hierarchy_and_disconnected_calendar() {
    let snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let calendar = snapshot
        .things
        .iter()
        .find(|thing| thing.id == "thing-calendar")
        .expect("calendar Thing");
    assert!(calendar.capabilities.external);
    assert!(!calendar.capabilities.forkable);
    assert_eq!(
        calendar
            .external_reference
            .as_ref()
            .map(|item| item.connection_status.as_str()),
        Some("disconnected")
    );

    let operation = snapshot
        .objects
        .iter()
        .find(|object| object.id == "operation-plan")
        .expect("operation");
    let subsystem = snapshot
        .objects
        .iter()
        .find(|object| Some(object.id.as_str()) == operation.parent_id.as_deref())
        .expect("operation subsystem");
    let thing_node = snapshot
        .objects
        .iter()
        .find(|object| Some(object.id.as_str()) == subsystem.parent_id.as_deref())
        .expect("subsystem Thing node");
    assert_eq!(thing_node.kind, "thing");
    assert!(snapshot.objects.iter().any(|object| {
        object.kind == "calendarBlock"
            && object.title.contains("French")
            && object
                .properties
                .get("connectionStatus")
                .map(String::as_str)
                == Some("disconnected")
    }));
    assert!(
        snapshot
            .theory
            .claims
            .iter()
            .all(|claim| claim.source.kind == SourceKind::Hypothesis)
    );
}

#[test]
fn conflict_fixture_records_calendar_conflict_as_an_assumption() {
    let snapshot = fixtures::snapshot("assistant-conflict").expect("fixture exists");
    let conflict = snapshot
        .objects
        .iter()
        .find(|object| object.kind == "schedulingConflict")
        .expect("modeled scheduling conflict");
    assert_eq!(conflict.source.kind, SourceKind::Assumption);
    assert_eq!(
        conflict
            .properties
            .get("calendarStatus")
            .map(String::as_str),
        Some("disconnected")
    );
}

#[test]
fn missing_required_link_in_complete_scope_is_blocked_with_provenance() {
    let snapshot = fixtures::snapshot("assistant-missing").expect("fixture exists");

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
    let finding = evaluation
        .findings
        .iter()
        .find(|finding| finding.rule_id == "assistant.outcome-requires-evaluation")
        .expect("required-link finding");
    assert_eq!(finding.source.reference, "template:assistant-world@1");
    assert!(finding.object_ids.iter().any(|id| id == "outcome-1"));
}

#[test]
fn missing_required_link_in_incomplete_mandatory_scope_is_unknown() {
    let snapshot = fixtures::snapshot("assistant-unknown").expect("fixture exists");

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert_eq!(evaluation.status, ReadinessStatus::Unknown);
    assert!(evaluation.findings.iter().any(|finding| {
        finding.rule_id == "assistant.outcome-requires-evaluation" && finding.severity == "unknown"
    }));
}

#[test]
fn conflicts_and_forbidden_cycles_block_readiness() {
    let snapshot = fixtures::snapshot("assistant-conflict").expect("fixture exists");

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "assistant.no-dependency-cycles")
    );
    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "assistant.constraints-compatible")
    );
    assert!(
        evaluation
            .derived_facts
            .iter()
            .any(|fact| fact.kind == "dependsTransitivelyOn")
    );
    let cycle = evaluation
        .findings
        .iter()
        .find(|finding| {
            finding.rule_id == "assistant.no-dependency-cycles"
                && finding.object_ids == vec!["planning-1"]
        })
        .expect("planning cycle");
    assert_eq!(
        cycle.fact_ids,
        vec!["rel-plan-calendar", "rel-calendar-plan"]
    );
}

#[test]
fn invalid_reference_is_attributed_to_its_relation() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot.relations[0].to_id = "missing-object".into();

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    let finding = evaluation
        .findings
        .iter()
        .find(|finding| finding.rule_id == "core.references-resolve")
        .expect("dangling reference finding");
    assert_eq!(finding.fact_ids, vec![snapshot.relations[0].id.clone()]);
}

#[test]
fn request_boundary_supports_children_and_explicit_errors() {
    let snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let request = CoreRequest {
        api_version: 1,
        snapshot,
        query: Query::Children {
            parent_id: "thing-planning".into(),
        },
    };

    let response = handle_request(&serde_json::to_string(&request).unwrap());
    let parsed: CoreResponse = serde_json::from_str(&response).unwrap();
    assert!(matches!(parsed, CoreResponse::Ok { .. }));

    let response = handle_request(r#"{"apiVersion":2}"#);
    let parsed: CoreResponse = serde_json::from_str(&response).unwrap();
    assert!(
        matches!(parsed, CoreResponse::Error { code, .. } if code == "unsupported_api_version")
    );

    let response = handle_request("not json");
    let parsed: CoreResponse = serde_json::from_str(&response).unwrap();
    assert!(matches!(parsed, CoreResponse::Error { code, .. } if code == "malformed_request"));
}

#[test]
fn resource_caps_fail_closed() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let first = snapshot.objects[0].clone();
    snapshot.objects = (0..=bropilot_core::MAX_OBJECTS)
        .map(|index| {
            let mut object = first.clone();
            object.id = format!("object-{index}");
            object
        })
        .collect();

    let error = evaluate_readiness(&snapshot).expect_err("over limit");
    assert_eq!(error.code(), "resource_limit");
}

#[test]
fn purpose_references_and_relation_endpoints_are_validated() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot.purpose.beneficiary_ids = vec!["missing-beneficiary".into()];
    snapshot.relations[0].from_id = "outcome-1".into();

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert!(evaluation.findings.iter().any(|finding| {
        finding.rule_id == "core.references-resolve"
            && finding.object_ids == vec!["missing-beneficiary"]
    }));
    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.relation-endpoints-legal")
    );
}

#[test]
fn missing_authorization_and_assay_links_block_when_scopes_are_complete() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot
        .relations
        .retain(|relation| relation.id != "rel-auth" && relation.id != "rel-assay");

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "assistant.operation-requires-authorization")
    );
    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "assistant.criterion-requires-assay")
    );
    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
}

#[test]
fn oversized_json_request_returns_resource_limit_without_parsing() {
    let request = "x".repeat(bropilot_core::MAX_REQUEST_BYTES + 1);

    let response = handle_request(&request);
    let parsed: CoreResponse = serde_json::from_str(&response).expect("error response");

    assert!(matches!(parsed, CoreResponse::Error { code, .. } if code == "resource_limit"));
}

#[test]
fn repeated_cycle_programs_are_rejected_by_preflight_limit() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    let rule = snapshot.template.forbidden_cycles[0].clone();
    snapshot.template.forbidden_cycles = vec![rule; bropilot_core::MAX_FORBIDDEN_CYCLE_RULES + 1];

    let error = evaluate_readiness(&snapshot).expect_err("cycle rule limit");

    assert_eq!(error.code(), "resource_limit");
}

#[test]
fn inference_output_and_witness_provenance_are_order_independent() {
    let original = fixtures::snapshot("assistant-conflict").expect("fixture exists");
    let mut permuted = original.clone();
    permuted.relations.reverse();

    let original_evaluation = evaluate_readiness(&original).expect("original evaluates");
    let permuted_evaluation = evaluate_readiness(&permuted).expect("permuted evaluates");

    assert_eq!(original_evaluation, permuted_evaluation);
    for finding in original_evaluation
        .findings
        .iter()
        .filter(|finding| finding.rule_id == "assistant.no-dependency-cycles")
    {
        assert!(!finding.fact_ids.iter().any(|id| id == "rel-plan-progress"));
    }
}

#[test]
fn pinned_template_revision_and_rule_pack_references_are_required() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot.things[0].template_ref.id.clear();
    snapshot.rule_packs[0].version.clear();

    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");

    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.thing-references-pinned")
    );
    assert!(
        evaluation
            .findings
            .iter()
            .any(|finding| finding.rule_id == "core.rule-packs-pinned")
    );
    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
}

#[test]
fn a_world_snapshot_requires_one_matching_root_world_object() {
    let mut snapshot = fixtures::snapshot("assistant-valid").expect("fixture exists");
    snapshot
        .objects
        .retain(|object| object.id != snapshot.world_id);
    snapshot.relations.retain(|relation| {
        relation.from_id != snapshot.world_id && relation.to_id != snapshot.world_id
    });
    for object in &mut snapshot.objects {
        if object.parent_id.as_deref() == Some(snapshot.world_id.as_str()) {
            object.parent_id = None;
        }
    }
    let evaluation = evaluate_readiness(&snapshot).expect("evaluation succeeds");
    assert_eq!(evaluation.status, ReadinessStatus::Blocked);
    assert!(
        evaluation
            .findings
            .iter()
            .any(|item| item.rule_id == "core.world-root")
    );
}
