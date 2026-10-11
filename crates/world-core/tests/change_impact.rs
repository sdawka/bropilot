use bropilot_core::{
    impact::{apply_impact_patch, evaluate_change_impact},
    *,
};
use std::collections::{BTreeMap, BTreeSet};
fn source() -> Source {
    Source {
        kind: SourceKind::Declared,
        reference: "test-input".into(),
    }
}
fn object(id: &str) -> ModelObject {
    ModelObject {
        id: id.into(),
        kind: "task".into(),
        title: id.into(),
        thing_id: None,
        parent_id: None,
        properties: BTreeMap::new(),
        source: source(),
    }
}
fn edge(id: &str, dependent: &str, dependency: &str) -> ModelRelation {
    ModelRelation {
        id: id.into(),
        kind: "dependsOn".into(),
        from_id: dependent.into(),
        to_id: dependency.into(),
        source: source(),
    }
}
fn snapshot() -> WorldSnapshot {
    let mut s = fixtures::snapshot("assistant-valid").unwrap();
    s.objects.clear();
    s.relations.clear();
    s.theory.claims.clear();
    s.completeness = [
        IMPACT_DEPENDENCY_SCOPE,
        IMPACT_CRITERION_SCOPE,
        IMPACT_METRIC_SCOPE,
    ]
    .iter()
    .map(|id| CompletenessDeclaration {
        scope_id: (*id).into(),
        status: CompletenessStatus::Complete,
        source: source(),
    })
    .collect();
    s.rule_packs.push(RulePackPin {
        id: ASSISTANT_IMPACT_PACK_ID.into(),
        version: ASSISTANT_IMPACT_PACK_VERSION.into(),
    });
    s
}
fn context() -> ImpactAnalysisContext {
    ImpactAnalysisContext {
        origin: ImpactOrigin::Saved,
        evidence_bindings: vec![],
    }
}
fn report(a: &WorldSnapshot, b: &WorldSnapshot) -> ChangeImpactReport {
    evaluate_change_impact(a, b, &context()).unwrap()
}
fn affected(r: &ChangeImpactReport) -> BTreeSet<String> {
    r.affected_things
        .iter()
        .flat_map(|t| t.objects.iter().map(|o| o.object_id.clone()))
        .collect()
}
#[test]
fn recursively_reaches_128_hops_in_dependency_orientation() {
    let mut a = snapshot();
    for i in 0..129 {
        a.objects.push(object(&format!("n{i:03}")));
        if i > 0 {
            a.relations.push(edge(
                &format!("r{i:03}"),
                &format!("n{i:03}"),
                &format!("n{:03}", i - 1),
            ));
        }
    }
    let mut b = a.clone();
    b.objects[0].title = "changed".into();
    let r = report(&a, &b);
    assert_eq!(affected(&r).len(), 129);
    let last = r
        .affected_things
        .iter()
        .flat_map(|t| &t.objects)
        .find(|o| o.object_id == "n128")
        .unwrap();
    assert_eq!(last.witnesses[0].relation_ids.len(), 128);
    assert!(
        last.witnesses
            .iter()
            .any(|w| w.side == ImpactSide::Baseline)
    );
    assert!(
        last.witnesses
            .iter()
            .any(|w| w.side == ImpactSide::Proposed)
    );
}
#[test]
fn compares_content_not_labels_or_order() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b")];
    a.relations = vec![edge("r", "b", "a")];
    let mut b = a.clone();
    b.revision_id = "different-label".into();
    b.objects.reverse();
    assert!(report(&a, &b).changes.is_empty());
    b.objects
        .iter_mut()
        .find(|o| o.id == "a")
        .unwrap()
        .properties
        .insert("statement".into(), "actual edit".into());
    assert_eq!(
        affected(&report(&a, &b)),
        BTreeSet::from(["a".into(), "b".into()])
    );
}
#[test]
fn removal_and_addition_do_not_make_hybrid_paths() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b"), object("c")];
    a.relations = vec![edge("old", "b", "a")];
    let mut b = a.clone();
    b.relations = vec![edge("new", "c", "b")];
    let r = report(&a, &b);
    for w in r
        .affected_things
        .iter()
        .flat_map(|t| &t.objects)
        .flat_map(|o| &o.witnesses)
    {
        assert!(
            !(w.relation_ids.contains(&"old".into()) && w.relation_ids.contains(&"new".into()))
        );
    }
}
#[test]
fn cycles_branches_and_multiple_causes_are_bounded_and_stable() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b"), object("c"), object("d")];
    a.relations = vec![
        edge("ba", "b", "a"),
        edge("ca", "c", "a"),
        edge("db", "d", "b"),
        edge("dc", "d", "c"),
        edge("ad", "a", "d"),
    ];
    let mut b = a.clone();
    b.objects[0].title = "edited-a".into();
    b.objects[2].title = "edited-c".into();
    let r = report(&a, &b);
    assert_eq!(affected(&r).len(), 4);
    let d = r
        .affected_things
        .iter()
        .flat_map(|t| &t.objects)
        .find(|o| o.object_id == "d")
        .unwrap();
    assert_eq!(d.witnesses.len(), 4);
    let mut reordered_a = a.clone();
    reordered_a.objects.reverse();
    reordered_a.relations.reverse();
    b.objects.reverse();
    b.relations.reverse();
    assert_eq!(r, report(&reordered_a, &b));
}
#[test]
fn ownership_never_propagates_and_proposals_are_diagnostic() {
    let mut a = snapshot();
    let mut parent = object("parent");
    parent.kind = "interface".into();
    let mut child = object("child");
    child.parent_id = Some("parent".into());
    a.objects = vec![parent, child, object("metric")];
    a.relations = vec![edge("upstream", "parent", "metric")];
    let mut b = a.clone();
    b.objects[0].title = "visual edit".into();
    assert_eq!(affected(&report(&a, &b)), BTreeSet::from(["parent".into()]));
    b.objects[0].source.kind = SourceKind::Proposal;
    let r = report(&a, &b);
    assert!(r.diagnostics.iter().any(|d| d.code == "non_factual_input"));
}
#[test]
fn missing_completeness_preserves_known_impacts() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b")];
    a.relations = vec![edge("r", "b", "a")];
    a.completeness.clear();
    let mut b = a.clone();
    b.objects[0].title = "edit".into();
    let r = report(&a, &b);
    assert!(!r.complete);
    assert_eq!(affected(&r).len(), 2);
    assert!(r.diagnostics.iter().any(|d| d.code == "incomplete_scope"));
}
#[test]
fn patch_is_typed_hypothetical_and_validates_endpoints() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b")];
    let p = ImpactPatch {
        operations: vec![ImpactPatchOperation::AddDependency {
            relation_id: "r".into(),
            dependent_id: "b".into(),
            dependency_id: "a".into(),
        }],
    };
    let draft = apply_impact_patch(&a, &p, "draft:unique").unwrap();
    assert_eq!(draft.state_kind, StateKind::Candidate);
    assert_eq!(draft.relations[0].source.kind, SourceKind::Declared);
    assert!(
        draft.relations[0]
            .source
            .reference
            .starts_with("hypothetical:")
    );
    assert!(a.relations.is_empty());
    assert!(apply_impact_patch(&a, &p, &a.revision_id).is_err());
    let malformed = ImpactPatch {
        operations: vec![ImpactPatchOperation::AddDependency {
            relation_id: "r".into(),
            dependent_id: "missing".into(),
            dependency_id: "a".into(),
        }],
    };
    assert!(apply_impact_patch(&a, &malformed, "draft:other").is_err());
}
#[test]
fn missing_pack_and_mismatched_schema_are_rejected() {
    let a = snapshot();
    let mut b = a.clone();
    b.rule_packs.retain(|p| p.id != ASSISTANT_IMPACT_PACK_ID);
    assert!(matches!(
        evaluate_change_impact(&a, &b, &context()),
        Err(CoreError::NotConfigured(_))
    ));
    b = a.clone();
    b.template.version = "2".into();
    assert!(matches!(
        evaluate_change_impact(&a, &b, &context()),
        Err(CoreError::Evaluation(_))
    ));
}
#[test]
fn preflight_work_cap_returns_error_without_partial_report() {
    let mut a = snapshot();
    a.objects = (0..501).map(|i| object(&format!("n{i}"))).collect();
    let mut b = a.clone();
    for o in &mut b.objects {
        o.title = "edit".into();
    }
    assert!(matches!(
        evaluate_change_impact(&a, &b, &context()),
        Err(CoreError::ResourceLimit(_))
    ));
}

#[test]
fn criterion_coverage_is_exact_and_carries_source_relation_ids() {
    let mut a = snapshot();
    let mut assay = object("assay");
    assay.kind = "assay".into();
    let mut criterion = object("criterion");
    criterion.kind = "acceptanceCriterion".into();
    a.objects = vec![object("input"), assay, criterion];
    let mut coverage = edge("covers-input", "assay", "input");
    coverage.kind = "covers".into();
    let mut verified = edge("verified", "criterion", "assay");
    verified.kind = "verifiedBy".into();
    a.relations = vec![coverage, verified];
    let mut b = a.clone();
    b.objects[0].title = "new".into();
    let r = report(&a, &b);
    assert_eq!(r.criteria.len(), 1);
    assert_eq!(r.assays.len(), 1);
    assert_eq!(r.criteria[0].assay_ids, vec!["assay"]);
    assert_eq!(
        r.criteria[0].witnesses[0].relation_ids,
        vec!["covers-input", "verified"]
    );
}
#[test]
fn changed_thing_revision_seeds_owned_objects_not_other_owners() {
    let mut a = snapshot();
    let thing_id = a.things[0].id.clone();
    let mut owned = object("owned");
    owned.thing_id = Some(thing_id.clone());
    a.objects = vec![owned, object("consumer"), object("other")];
    a.relations = vec![edge("dependency", "consumer", "owned")];
    let mut b = a.clone();
    b.things[0].revision_id = "next".into();
    let r = report(&a, &b);
    assert_eq!(
        affected(&r),
        BTreeSet::from(["owned".into(), "consumer".into()])
    );
    assert!(
        r.affected_things
            .iter()
            .flat_map(|t| &t.objects)
            .flat_map(|o| &o.witnesses)
            .all(|w| w.seed_id == thing_id)
    );
}
#[test]
fn changed_relation_endpoint_is_separate_on_each_side() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b"), object("c")];
    a.relations = vec![edge("edge", "c", "a")];
    let mut b = a.clone();
    b.relations[0].to_id = "b".into();
    let r = report(&a, &b);
    let c = r
        .affected_things
        .iter()
        .flat_map(|t| &t.objects)
        .find(|o| o.object_id == "c")
        .unwrap();
    assert_eq!(c.witnesses[0].object_ids, vec!["a", "c"]);
    assert_eq!(c.witnesses[1].object_ids, vec!["b", "c"]);
    assert_eq!(c.witnesses[0].side, ImpactSide::Baseline);
    assert_eq!(c.witnesses[1].side, ImpactSide::Proposed);
}
#[test]
fn introduced_hypothesis_cannot_establish_dependency_facts() {
    let mut a = snapshot();
    a.objects = vec![object("a"), object("b")];
    let mut b = a.clone();
    b.objects[0].title = "new".into();
    let mut proposed = edge("hypothesis", "b", "a");
    proposed.source.kind = SourceKind::Hypothesis;
    b.relations.push(proposed);
    let r = report(&a, &b);
    assert_eq!(affected(&r), BTreeSet::from(["a".into()]));
    assert!(r.diagnostics.iter().any(|d| d.code == "non_factual_input"));
}
fn bound_context(s: &WorldSnapshot) -> ImpactAnalysisContext {
    ImpactAnalysisContext {
        origin: ImpactOrigin::Saved,
        evidence_bindings: assistant_impact::sample_evidence(s).unwrap(),
    }
}
fn impact_fixture() -> WorldSnapshot {
    assistant_impact::snapshot("assistant-impact-baseline").unwrap()
}
#[test]
fn unchanged_bound_synthetic_evidence_matches_without_promoting_provenance() {
    let a = impact_fixture();
    let ctx = bound_context(&a);
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert!(!r.evidence.is_empty());
    assert!(
        r.evidence
            .iter()
            .all(|e| e.applicability == EvidenceApplicability::InputsMatch)
    );
    assert!(
        r.evidence
            .iter()
            .all(|e| e.provenance == EvidenceProvenance::Synthetic)
    );
    assert!(r.changes.is_empty());
}
#[test]
fn evidence_input_and_assay_changes_require_recheck() {
    let a = impact_fixture();
    let ctx = bound_context(&a);
    let mut b = a.clone();
    let id = ctx.evidence_bindings[0].object_inputs[0].object_id.clone();
    b.objects.iter_mut().find(|o| o.id == id).unwrap().title = "changed captured input".into();
    let r = evaluate_change_impact(&a, &b, &ctx).unwrap();
    assert_eq!(
        r.evidence[0].applicability,
        EvidenceApplicability::NeedsRecheck
    );
    let mut b = a.clone();
    let id = &ctx.evidence_bindings[0].assay_id;
    b.objects.iter_mut().find(|o| &o.id == id).unwrap().title = "changed definition".into();
    let r = evaluate_change_impact(&a, &b, &ctx).unwrap();
    assert_eq!(
        r.evidence[0].applicability,
        EvidenceApplicability::NeedsRecheck
    );
}
#[test]
fn missing_bindings_references_or_complete_scopes_never_grant_reuse() {
    let a = impact_fixture();
    let mut ctx = bound_context(&a);
    ctx.evidence_bindings[0].relation_inputs.clear();
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert_eq!(r.evidence[0].applicability, EvidenceApplicability::Unknown);
    let mut ctx = bound_context(&a);
    ctx.evidence_bindings[0].object_inputs[0].object_id = "absent".into();
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert_eq!(r.evidence[0].applicability, EvidenceApplicability::Unknown);
    let mut incomplete = a.clone();
    incomplete
        .completeness
        .retain(|c| c.scope_id != IMPACT_DEPENDENCY_SCOPE);
    let r = evaluate_change_impact(&incomplete, &incomplete, &bound_context(&a)).unwrap();
    assert!(
        r.evidence
            .iter()
            .all(|e| e.applicability == EvidenceApplicability::Unknown)
    );
}
#[test]
fn evidence_rule_pins_and_thing_revisions_require_exact_matches() {
    let a = impact_fixture();
    let mut ctx = bound_context(&a);
    ctx.evidence_bindings[0].rule_packs[0].version = "old".into();
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert_eq!(
        r.evidence[0].applicability,
        EvidenceApplicability::NeedsRecheck
    );
    let mut ctx = bound_context(&a);
    ctx.evidence_bindings[0].thing_revisions[0].revision_id = "old".into();
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert_eq!(
        r.evidence[0].applicability,
        EvidenceApplicability::NeedsRecheck
    );
}
#[test]
fn source_only_historical_evidence_is_unknown() {
    let mut a = snapshot();
    let mut evidence = object("old-evidence");
    evidence.kind = "evidence".into();
    a.objects.push(evidence);
    let r = report(&a, &a);
    assert_eq!(r.evidence.len(), 1);
    assert_eq!(r.evidence[0].applicability, EvidenceApplicability::Unknown);
    assert_eq!(r.evidence[0].provenance, EvidenceProvenance::Unverified);
}
#[test]
fn malformed_property_patch_cannot_promote_a_proposal_or_modify_assay() {
    let mut a = impact_fixture();
    let cases = [
        (
            assistant_impact::METRIC_ID,
            ImpactProperty::DefinitionHash,
            "forged",
        ),
        ("plan-item-1", ImpactProperty::Status, "passed"),
        ("plan-item-1", ImpactProperty::PlannedAt, "not UTC"),
    ];
    for (id, property, value) in cases {
        let p = ImpactPatch {
            operations: vec![ImpactPatchOperation::SetProperty {
                object_id: id.into(),
                property,
                value: value.into(),
            }],
        };
        assert!(apply_impact_patch(&a, &p, "draft:test").is_err());
    }
    a.objects[0].source.kind = SourceKind::Proposal;
    let p = ImpactPatch {
        operations: vec![ImpactPatchOperation::SetProperty {
            object_id: a.objects[0].id.clone(),
            property: ImpactProperty::Statement,
            value: "new".into(),
        }],
    };
    assert!(apply_impact_patch(&a, &p, "draft:test").is_err());
}
#[test]
fn actual_same_revision_content_hash_and_property_provenance_are_reported() {
    let mut a = snapshot();
    a.objects = vec![object("a")];
    let mut b = a.clone();
    b.objects[0].source.reference = "new provenance".into();
    let r = report(&a, &b);
    assert_ne!(r.baseline.snapshot_hash, r.target.snapshot_hash);
    assert!(r.changes[0].changed_fields.contains(&"source".into()));
    assert!(
        r.diagnostics
            .iter()
            .any(|d| d.code == "revision_content_mismatch")
    );
}
#[test]
fn zero_edits_have_no_impacts_and_a_distinct_candidate_identity() {
    let a = snapshot();
    let draft = apply_impact_patch(&a, &ImpactPatch { operations: vec![] }, "draft:empty").unwrap();
    assert_eq!(draft.state_kind, StateKind::Candidate);
    let r = report(&a, &draft);
    assert!(affected(&r).is_empty());
    assert!(
        r.changes
            .iter()
            .all(|c| c.entity_kind == ImpactEntityKind::Context)
    );
}
#[test]
fn seeded_graphs_match_an_independent_fixed_point_oracle() {
    // Independent set expansion uses forward dependent membership, not engine BFS/Ascent.
    for seed in 0u64..24 {
        let mut state = seed + 1;
        let mut a = snapshot();
        a.objects = (0..24).map(|i| object(&format!("n{i:02}"))).collect();
        for i in 0..70 {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1);
            let from = (state >> 32) % 24;
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1);
            let to = (state >> 32) % 24;
            a.relations.push(edge(
                &format!("e{i:02}"),
                &format!("n{from:02}"),
                &format!("n{to:02}"),
            ));
        }
        let mut b = a.clone();
        let changed = (seed % 24) as usize;
        b.objects[changed].title = "new".into();
        let mut expected = BTreeSet::from([a.objects[changed].id.clone()]);
        loop {
            let previous = expected.len();
            for r in &a.relations {
                if expected.contains(&r.to_id) {
                    expected.insert(r.from_id.clone());
                }
            }
            if expected.len() == previous {
                break;
            }
        }
        assert_eq!(affected(&report(&a, &b)), expected, "seed {seed}");
    }
}
#[test]
fn report_size_cap_never_returns_truncated_success() {
    let mut a = snapshot();
    a.objects = (0..100)
        .map(|i| {
            let mut o = object(&format!("n{i}"));
            o.title = "a".repeat(6000);
            o
        })
        .collect();
    let mut b = a.clone();
    for o in &mut b.objects {
        o.title = "b".repeat(6000);
    }
    assert!(matches!(
        evaluate_change_impact(&a, &b, &context()),
        Err(CoreError::ResourceLimit(_))
    ));
}
#[test]
fn typed_metric_definition_patch_preserves_a_known_projection() {
    let a = impact_fixture();
    let p = ImpactPatch {
        operations: vec![ImpactPatchOperation::SetMetricDefinition {
            metric_id: assistant_impact::METRIC_ID.into(),
            definition: MetricDefinition::CompletedPlannedTasksIncludingCancelled,
        }],
    };
    let draft = apply_impact_patch(&a, &p, "draft:metric").unwrap();
    let r = report(&a, &draft);
    assert_eq!(
        r.metrics[0].proposed.as_ref().unwrap().status,
        MetricStatus::Known
    );
}
#[test]
fn evidence_closure_work_is_bounded_before_inference() {
    let mut a = snapshot();
    a.objects = (0..501).map(|i| object(&format!("n{i}"))).collect();
    let binding = EvidenceBinding {
        evidence_id: "e".into(),
        assay_id: "n0".into(),
        assay_definition_hash: None,
        object_inputs: vec![],
        relation_inputs: vec![],
        thing_revisions: vec![],
        rule_packs: vec![],
        provenance: EvidenceProvenance::Unverified,
    };
    let mut ctx = context();
    ctx.evidence_bindings = (0..MAX_IMPACT_EVIDENCE_BINDINGS)
        .map(|i| {
            let mut b = binding.clone();
            b.evidence_id = format!("e{i}");
            b
        })
        .collect();
    assert!(matches!(
        evaluate_change_impact(&a, &a, &ctx),
        Err(CoreError::ResourceLimit(_))
    ));
}
#[test]
fn wrong_kind_dependency_cannot_make_evidence_a_functional_component() {
    let mut a = snapshot();
    let mut e = object("e");
    e.kind = "evidence".into();
    a.objects = vec![object("a"), e];
    a.relations = vec![edge("invalid-dependency", "e", "a")];
    let mut b = a.clone();
    b.objects[0].title = "change".into();
    assert_eq!(affected(&report(&a, &b)), BTreeSet::from(["a".into()]));
}
#[test]
fn unresolved_approved_relation_prevents_reuse_despite_complete_declaration() {
    let mut a = impact_fixture();
    let ctx = bound_context(&a);
    let assay_id = ctx.evidence_bindings[0].assay_id.clone();
    let target_id = ctx.evidence_bindings[0].object_inputs[0].object_id.clone();
    let mut r = edge("unresolved-coverage", &assay_id, &target_id);
    r.kind = "covers".into();
    r.source.kind = SourceKind::Hypothesis;
    a.relations.push(r);
    let r = evaluate_change_impact(&a, &a, &ctx).unwrap();
    assert!(!r.complete);
    assert!(
        r.evidence
            .iter()
            .all(|e| e.applicability == EvidenceApplicability::Unknown)
    );
}
#[test]
fn evidence_requires_the_assay_owner_revision_and_tracks_assay_impacts() {
    let mut a = impact_fixture();
    let mut ctx = bound_context(&a);
    let assay_id = ctx.evidence_bindings[0].assay_id.clone();
    let owner = "thing-interface";
    let assay = a.objects.iter_mut().find(|o| o.id == assay_id).unwrap();
    assay.thing_id = Some(owner.into());
    ctx.evidence_bindings[0].assay_definition_hash = Some(content_hash(assay).unwrap());
    ctx.evidence_bindings[0]
        .object_inputs
        .retain(|o| o.object_id != assay_id);
    ctx.evidence_bindings[0]
        .thing_revisions
        .retain(|t| t.thing_id != owner);
    let mut b = a.clone();
    let thing = b.things.iter_mut().find(|t| t.id == owner).unwrap();
    thing.revision_id = "next".into();
    let r = evaluate_change_impact(&a, &b, &ctx).unwrap();
    assert_eq!(r.evidence[0].applicability, EvidenceApplicability::Unknown);
    ctx.evidence_bindings[0]
        .thing_revisions
        .push(BoundThingRevision {
            thing_id: owner.into(),
            revision_id: a
                .things
                .iter()
                .find(|t| t.id == owner)
                .unwrap()
                .revision_id
                .clone(),
        });
    let r = evaluate_change_impact(&a, &b, &ctx).unwrap();
    assert_eq!(
        r.evidence[0].applicability,
        EvidenceApplicability::NeedsRecheck
    );
}
#[test]
fn dense_closures_and_deep_witnesses_return_resource_errors() {
    let mut star = snapshot();
    star.objects = (0..120).map(|i| object(&format!("n{i:03}"))).collect();
    for i in 1..120 {
        star.relations
            .push(edge(&format!("out{i}"), &format!("n{i:03}"), "n000"));
        star.relations
            .push(edge(&format!("in{i}"), "n000", &format!("n{i:03}")));
    }
    let mut changed = star.clone();
    for o in &mut changed.objects {
        o.title = "edit".into();
    }
    assert!(
        matches!(evaluate_change_impact(&star,&changed,&context()),Err(CoreError::ResourceLimit(m)) if m.contains("derived pairs") || m.contains("witness bytes"))
    );
    let mut chain = snapshot();
    for i in 0..230 {
        chain.objects.push(object(&format!("n{i:03}")));
        if i > 0 {
            chain.relations.push(edge(
                &format!("r{i:03}"),
                &format!("n{i:03}"),
                &format!("n{:03}", i - 1),
            ));
        }
    }
    let mut changed = chain.clone();
    changed.objects[0].title = "edit".into();
    assert!(
        matches!(evaluate_change_impact(&chain,&changed,&context()),Err(CoreError::ResourceLimit(m)) if m.contains("witness references"))
    );
}
#[test]
fn input_patch_and_binding_count_caps_reject_before_allocating_closure() {
    let mut a = snapshot();
    a.objects = (0..=MAX_OBJECTS)
        .map(|i| object(&format!("n{i}")))
        .collect();
    assert!(matches!(
        evaluate_change_impact(&a, &a, &context()),
        Err(CoreError::ResourceLimit(_))
    ));
    let a = snapshot();
    let p = ImpactPatch {
        operations: (0..=MAX_IMPACT_PATCH_OPERATIONS)
            .map(|_| ImpactPatchOperation::RemoveDependency {
                relation_id: "missing".into(),
            })
            .collect(),
    };
    assert!(matches!(
        apply_impact_patch(&a, &p, "draft:bounded"),
        Err(CoreError::ResourceLimit(_))
    ));
}
#[test]
fn long_identifiers_are_byte_bounded_before_witness_materialization() {
    let mut a = snapshot();
    for i in 0..35 {
        let id = format!("{i:02}{}", "x".repeat(3000));
        a.objects.push(object(&id));
        if i > 0 {
            a.relations.push(edge(
                &format!("r{i}"),
                &a.objects[i].id,
                &a.objects[i - 1].id,
            ));
        }
    }
    let mut b = a.clone();
    b.objects[0].title = "edit".into();
    assert!(
        matches!(evaluate_change_impact(&a,&b,&context()),Err(CoreError::ResourceLimit(m)) if m.contains("witness bytes"))
    );
}

#[test]
fn side_projection_preserves_baseline_assay_when_proposed_kind_changes() {
    let mut a = snapshot();
    let mut assay = object("assay-retyped");
    assay.kind = "assay".into();
    a.objects = vec![assay];
    let mut b = a.clone();
    b.objects[0].kind = "service".into();
    let r = report(&a, &b);
    let assay = r
        .assays
        .iter()
        .find(|o| o.object_id == "assay-retyped")
        .expect("baseline Assay remains attributed");
    assert_eq!(assay.side, ImpactSide::Baseline);
    assert_eq!(assay.kind, "assay");
    assert!(
        assay
            .witnesses
            .iter()
            .all(|w| w.side == ImpactSide::Baseline)
    );
}
#[test]
fn side_projection_preserves_baseline_criterion_when_proposed_kind_changes() {
    let mut a = snapshot();
    let mut criterion = object("criterion-retyped");
    criterion.kind = "acceptanceCriterion".into();
    a.objects = vec![criterion];
    let mut b = a.clone();
    b.objects[0].kind = "task".into();
    let r = report(&a, &b);
    let criterion = r
        .criteria
        .iter()
        .find(|o| o.criterion_id == "criterion-retyped")
        .expect("baseline criterion remains attributed");
    assert_eq!(criterion.side, ImpactSide::Baseline);
    assert!(
        criterion
            .witnesses
            .iter()
            .all(|w| w.side == ImpactSide::Baseline)
    );
}
#[test]
fn side_projection_preserves_both_thing_owners_when_ownership_changes() {
    let mut a = snapshot();
    let mut task = object("task-moved");
    task.thing_id = Some(a.things[0].id.clone());
    a.objects = vec![task];
    let mut b = a.clone();
    b.objects[0].thing_id = Some(a.things[1].id.clone());
    let r = report(&a, &b);
    for (thing, side) in [
        (&a.things[0].id, ImpactSide::Baseline),
        (&a.things[1].id, ImpactSide::Proposed),
    ] {
        let object = r
            .affected_things
            .iter()
            .find(|g| g.thing_id.as_ref() == Some(thing))
            .and_then(|g| g.objects.iter().find(|o| o.object_id == "task-moved"))
            .expect("exact historical owner group");
        assert_eq!(object.side, side);
        assert!(object.witnesses.iter().all(|w| w.side == side));
    }
}
