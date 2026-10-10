use bropilot_core::{CompletenessStatus, MetricComparability, MetricStatus, assistant_impact};

fn fixture() -> bropilot_core::WorldSnapshot {
    assistant_impact::snapshot("assistant-impact-baseline").unwrap()
}

#[test]
fn synthetic_sample_counts_unique_completed_planned_tasks() {
    let baseline = fixture();
    let metric = assistant_impact::assess_metrics(&baseline)
        .unwrap()
        .remove(0);
    assert_eq!((metric.completed_count, metric.planned_count), (3, 5));
    assert_eq!(metric.value, Some(0.6));
    assert_eq!(metric.status, MetricStatus::Known);
    assert!(
        metric
            .input_refs
            .iter()
            .all(|input| input.digest.len() == 64)
    );
    let evidence = assistant_impact::sample_evidence(&baseline).unwrap();
    assert!(
        evidence
            .iter()
            .all(|binding| binding.provenance == bropilot_core::EvidenceProvenance::Synthetic)
    );
    assert!(!evidence[0].relation_inputs.is_empty());
}

#[test]
fn definition_revision_is_not_comparable() {
    let changed = assistant_impact::snapshot("assistant-impact-metric-definition").unwrap();
    let comparison = assistant_impact::evaluate_metrics(&fixture(), &changed)
        .unwrap()
        .remove(0);
    assert_eq!(comparison.proposed.unwrap().value, Some(0.5));
    assert_eq!(
        comparison.comparability,
        MetricComparability::DefinitionChanged
    );
    assert_eq!(comparison.delta, None);
}

#[test]
fn missing_coverage_and_zero_denominator_are_unknown() {
    let mut baseline = fixture();
    baseline
        .completeness
        .iter_mut()
        .find(|scope| scope.scope_id == "impact-metric-lineage")
        .unwrap()
        .status = CompletenessStatus::Incomplete;
    let assessment = assistant_impact::assess_metrics(&baseline)
        .unwrap()
        .remove(0);
    assert_eq!(assessment.status, MetricStatus::Unknown);
    assert_eq!(assessment.value, None);
    assert_eq!(assessment.planned_count, 5);
    let mut empty = fixture();
    for item in empty
        .objects
        .iter_mut()
        .filter(|object| object.kind == "planItem")
    {
        item.properties.insert("status".into(), "cancelled".into());
    }
    assert_eq!(
        assistant_impact::assess_metrics(&empty).unwrap()[0].status,
        MetricStatus::Unknown
    );
}

#[test]
fn scenarios_preserve_identity_and_managed_calendar_boundary() {
    let baseline = fixture();
    assert_eq!(
        baseline
            .things
            .iter()
            .filter(|thing| !thing.capabilities.external)
            .count(),
        4
    );
    assert_eq!(
        baseline
            .things
            .iter()
            .filter(|thing| thing.capabilities.external)
            .count(),
        1
    );
    for id in assistant_impact::ids() {
        let scenario = assistant_impact::snapshot(id).unwrap();
        assert_eq!(scenario.world_id, baseline.world_id);
        assert_eq!(scenario.objects.len(), baseline.objects.len());
        assert!(
            scenario
                .objects
                .iter()
                .all(|object| object.source.reference.contains("synthetic"))
        );
        assistant_impact::assess_metrics(&scenario).unwrap();
    }
}

#[test]
fn duplicates_deduplicate_but_conflicting_duplicates_fail() {
    let mut baseline = fixture();
    let mut duplicate = baseline
        .objects
        .iter()
        .find(|object| object.id == "plan-task-1")
        .unwrap()
        .clone();
    duplicate.id = "duplicate-plan".into();
    baseline.objects.push(duplicate.clone());
    let mut edge = baseline
        .relations
        .iter()
        .find(|edge| edge.from_id == "metric-completed-planned-work" && edge.to_id == "plan-task-1")
        .unwrap()
        .clone();
    edge.id = "duplicate-lineage".into();
    edge.to_id = duplicate.id.clone();
    baseline.relations.push(edge);
    assert_eq!(
        assistant_impact::assess_metrics(&baseline).unwrap()[0].planned_count,
        5
    );
    baseline
        .objects
        .last_mut()
        .unwrap()
        .properties
        .insert("status".into(), "cancelled".into());
    assert!(assistant_impact::assess_metrics(&baseline).is_err());
}

#[test]
fn utc_window_is_start_inclusive_end_exclusive_and_validated() {
    let mut baseline = fixture();
    baseline
        .objects
        .iter_mut()
        .find(|object| object.id == "completion-task-1")
        .unwrap()
        .properties
        .insert("completedAt".into(), "2026-10-12T00:00:00Z".into());
    assert_eq!(
        assistant_impact::assess_metrics(&baseline).unwrap()[0].completed_count,
        2
    );
    baseline
        .objects
        .iter_mut()
        .find(|object| object.id == "completion-task-1")
        .unwrap()
        .properties
        .insert("completedAt".into(), "2026-10-05T00:00:00Z".into());
    assert_eq!(
        assistant_impact::assess_metrics(&baseline).unwrap()[0].completed_count,
        3
    );
    baseline
        .objects
        .iter_mut()
        .find(|object| object.id == "completion-task-1")
        .unwrap()
        .properties
        .insert("completedAt".into(), "2026-02-30T00:00:00Z".into());
    assert!(assistant_impact::assess_metrics(&baseline).is_err());
}

#[test]
fn malformed_reference_status_and_numeric_claims_cannot_override_arithmetic() {
    let mut baseline = fixture();
    baseline
        .objects
        .iter_mut()
        .find(|object| object.kind == "metric")
        .unwrap()
        .properties
        .insert("value".into(), "99".into());
    assert_eq!(
        assistant_impact::assess_metrics(&baseline).unwrap()[0].value,
        Some(0.6)
    );
    baseline
        .objects
        .iter_mut()
        .find(|object| object.id == "plan-task-1")
        .unwrap()
        .properties
        .insert("taskId".into(), "unknown-task".into());
    assert!(assistant_impact::assess_metrics(&baseline).is_err());
    let mut baseline = fixture();
    baseline
        .objects
        .iter_mut()
        .find(|object| object.id == "plan-task-1")
        .unwrap()
        .properties
        .insert("status".into(), "occupied".into());
    assert!(assistant_impact::assess_metrics(&baseline).is_err());
}

#[test]
fn observation_duplicates_deduplicate_and_conflicts_fail() {
    let mut baseline = fixture();
    let mut duplicate = baseline
        .objects
        .iter()
        .find(|object| object.id == "completion-task-1")
        .unwrap()
        .clone();
    duplicate.id = "duplicate-completion".into();
    baseline.objects.push(duplicate.clone());
    let mut edge = baseline
        .relations
        .iter()
        .find(|edge| edge.to_id == "completion-task-1")
        .unwrap()
        .clone();
    edge.id = "duplicate-observation-lineage".into();
    edge.to_id = duplicate.id;
    baseline.relations.push(edge);
    assert_eq!(
        assistant_impact::assess_metrics(&baseline).unwrap()[0].completed_count,
        3
    );
    baseline
        .objects
        .last_mut()
        .unwrap()
        .properties
        .insert("completedAt".into(), "2026-10-08T00:00:00Z".into());
    assert!(assistant_impact::assess_metrics(&baseline).is_err());
}

#[test]
fn window_changes_and_missing_lineage_suppress_deltas() {
    let baseline = fixture();
    let mut target = fixture();
    target
        .objects
        .iter_mut()
        .find(|node| node.id == assistant_impact::METRIC_ID)
        .unwrap()
        .properties
        .insert("windowStart".into(), "2026-10-06T00:00:00Z".into());
    let compared = assistant_impact::evaluate_metrics(&baseline, &target).unwrap();
    assert_eq!(
        compared[0].comparability,
        MetricComparability::WindowChanged
    );
    assert_eq!(compared[0].delta, None);
    let mut target = fixture();
    target
        .relations
        .retain(|edge| edge.id != "lineage-completion-1");
    assert_eq!(
        assistant_impact::assess_metrics(&target).unwrap()[0].status,
        MetricStatus::Unknown
    );
}

#[test]
fn evidence_pins_actual_objects_relations_and_things() {
    let baseline = fixture();
    for binding in assistant_impact::sample_evidence(&baseline).unwrap() {
        assert_eq!(
            binding.assay_definition_hash,
            Some(
                bropilot_core::content_hash(
                    baseline
                        .objects
                        .iter()
                        .find(|object| object.id == binding.assay_id)
                        .unwrap()
                )
                .unwrap()
            )
        );
        for input in binding.object_inputs {
            assert_eq!(
                input.digest,
                bropilot_core::content_hash(
                    baseline
                        .objects
                        .iter()
                        .find(|object| object.id == input.object_id)
                        .unwrap()
                )
                .unwrap()
            );
        }
        for input in binding.relation_inputs {
            assert_eq!(
                input.digest,
                bropilot_core::content_hash(
                    baseline
                        .relations
                        .iter()
                        .find(|edge| edge.id == input.relation_id)
                        .unwrap()
                )
                .unwrap()
            );
        }
        for pin in binding.thing_revisions {
            assert_eq!(
                pin.revision_id,
                baseline
                    .things
                    .iter()
                    .find(|thing| thing.id == pin.thing_id)
                    .unwrap()
                    .revision_id
            );
        }
    }
}

#[test]
fn fixture_ontology_endpoints_validate_in_foundation_readiness() {
    for id in assistant_impact::ids() {
        let report =
            bropilot_core::evaluate_readiness(&assistant_impact::snapshot(id).unwrap()).unwrap();
        assert!(
            report
                .findings
                .iter()
                .all(|finding| !finding.rule_id.contains("endpoint")),
            "{id}: {:?}",
            report.findings
        );
    }
}

fn unknown_metric(
    model: &bropilot_core::WorldSnapshot,
    reason: &str,
) -> bropilot_core::MetricAssessment {
    let assessment = assistant_impact::assess_metrics(model).unwrap().remove(0);
    assert_eq!(assessment.status, MetricStatus::Unknown);
    assert_eq!(assessment.value, None);
    assert!(
        assessment
            .diagnostics
            .iter()
            .any(|message| message.contains(reason)),
        "{:?}",
        assessment.diagnostics
    );
    assessment
}

#[test]
fn speculative_metric_object_cannot_establish_arithmetic() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == assistant_impact::METRIC_ID)
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Hypothesis;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (0, 0)
    );
}

#[test]
fn speculative_metric_definition_cannot_establish_arithmetic() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == assistant_impact::DEFINITION_ID)
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Hypothesis;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (0, 0)
    );
}

#[test]
fn speculative_plan_item_is_excluded_from_partial_counts() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == "plan-task-1")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 4)
    );
}

#[test]
fn speculative_completion_is_excluded_from_partial_counts() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == "completion-task-1")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Hypothesis;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 5)
    );
}

#[test]
fn speculative_plan_lineage_cannot_establish_membership() {
    let mut model = fixture();
    model
        .relations
        .iter_mut()
        .find(|edge| edge.id == "lineage-plan-1")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "lineage");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 4)
    );
}

#[test]
fn speculative_definition_lineage_cannot_establish_arithmetic() {
    let mut model = fixture();
    model
        .relations
        .iter_mut()
        .find(|edge| edge.id == "metric-definition")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "lineage");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (0, 0)
    );
}

#[test]
fn speculative_completion_coverage_retains_partial_counts_without_value() {
    let mut model = fixture();
    model
        .completeness
        .iter_mut()
        .find(|scope| scope.scope_id == "impact-metric-lineage")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "coverage");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (3, 5)
    );
}

#[test]
fn malformed_definition_hash_is_rejected() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == assistant_impact::METRIC_ID)
        .unwrap()
        .properties
        .insert("definitionHash".into(), "not-a-canonical-digest".into());
    assert!(assistant_impact::assess_metrics(&model).is_err());
}

#[test]
fn speculative_completion_lineage_is_excluded_from_partial_counts() {
    let mut model = fixture();
    model
        .relations
        .iter_mut()
        .find(|edge| edge.id == "lineage-completion-1")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "lineage");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 5)
    );
}

#[test]
fn observed_metric_inputs_and_coverage_are_established() {
    let mut model = fixture();
    for object in &mut model.objects {
        object.source.kind = bropilot_core::SourceKind::Observation;
    }
    for edge in &mut model.relations {
        edge.source.kind = bropilot_core::SourceKind::Observation;
    }
    for declaration in &mut model.completeness {
        declaration.source.kind = bropilot_core::SourceKind::Observation;
    }
    assert_eq!(
        assistant_impact::assess_metrics(&model).unwrap()[0].value,
        Some(0.6)
    );
}

#[test]
fn hypothetical_task_identity_makes_metric_unknown() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == "task-1")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Hypothesis;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 4)
    );
}

#[test]
fn proposed_task_identity_makes_metric_unknown() {
    let mut model = fixture();
    model
        .objects
        .iter_mut()
        .find(|node| node.id == "task-2")
        .unwrap()
        .source
        .kind = bropilot_core::SourceKind::Proposal;
    let assessment = unknown_metric(&model, "provenance");
    assert_eq!(
        (assessment.completed_count, assessment.planned_count),
        (2, 4)
    );
}

#[test]
fn task_identity_is_digest_pinned_in_metric_and_synthetic_evidence() {
    let model = fixture();
    let task = model
        .objects
        .iter()
        .find(|node| node.id == "task-1")
        .unwrap();
    let digest = bropilot_core::content_hash(task).unwrap();
    let assessment = assistant_impact::assess_metrics(&model).unwrap().remove(0);
    assert!(
        assessment
            .input_refs
            .iter()
            .any(|input| input.object_id == task.id && input.digest == digest)
    );
    let binding = assistant_impact::sample_evidence(&model)
        .unwrap()
        .into_iter()
        .find(|binding| binding.assay_id == "assay-progress")
        .unwrap();
    assert!(
        binding
            .object_inputs
            .iter()
            .any(|input| input.object_id == task.id && input.digest == digest)
    );
}

#[test]
fn declared_task_dependency_propagates_changes_to_metric_and_assay() {
    let baseline = fixture();
    let mut proposed = fixture();
    proposed
        .objects
        .iter_mut()
        .find(|node| node.id == "task-1")
        .unwrap()
        .title = "Revised synthetic task".into();
    let report = bropilot_core::impact::evaluate_change_impact(
        &baseline,
        &proposed,
        &bropilot_core::ImpactAnalysisContext {
            origin: bropilot_core::ImpactOrigin::Hypothetical,
            evidence_bindings: assistant_impact::sample_evidence(&baseline).unwrap(),
        },
    )
    .unwrap();
    assert!(
        report
            .affected_things
            .iter()
            .flat_map(|thing| thing.objects.iter())
            .any(|object| object.object_id == assistant_impact::METRIC_ID)
    );
    assert!(
        report
            .assays
            .iter()
            .any(|assay| assay.object_id == "assay-progress")
    );
    let binding = assistant_impact::sample_evidence(&baseline)
        .unwrap()
        .into_iter()
        .find(|binding| binding.assay_id == "assay-progress")
        .unwrap();
    assert!(
        binding
            .thing_revisions
            .iter()
            .any(|pin| pin.thing_id == "thing-planning" && pin.revision_id == "planning@1")
    );
    assert!(
        binding
            .relation_inputs
            .iter()
            .any(|input| input.relation_id == "lineage-task-1")
    );
}
