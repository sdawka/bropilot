//! Reproducible native semantic/timing comparison. Timings measure different workloads:
//! direct neighbor lookup versus full validated recursive impact reports.
use bropilot_core::{
    EvidenceBinding, ImpactAnalysisContext, ImpactOrigin, ModelObject, ModelRelation, Source,
    SourceKind, WorldSnapshot, assistant_impact, content_hash, impact::evaluate_change_impact,
};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Instant,
};
fn direct_neighbors(a: &WorldSnapshot, b: &WorldSnapshot) -> BTreeSet<String> {
    let old: BTreeMap<_, _> = a.objects.iter().map(|o| (&o.id, o)).collect();
    let changed: BTreeSet<_> = b
        .objects
        .iter()
        .filter(|o| old.get(&o.id).is_none_or(|old| *old != *o))
        .map(|o| o.id.clone())
        .collect();
    let mut affected = changed.clone();
    for s in [a, b] {
        for edge in &s.relations {
            if edge.kind == "dependsOn" && changed.contains(&edge.to_id) {
                affected.insert(edge.from_id.clone());
            }
        }
    }
    affected
}
fn measure(
    a: &WorldSnapshot,
    b: &WorldSnapshot,
    bindings: Vec<EvidenceBinding>,
) -> serde_json::Value {
    let context = ImpactAnalysisContext {
        origin: ImpactOrigin::Saved,
        evidence_bindings: bindings,
    };
    let mut direct_times = vec![];
    let mut recursive_times = vec![];
    let mut direct = BTreeSet::new();
    let mut report = None;
    for _ in 0..7 {
        let start = Instant::now();
        direct = std::hint::black_box(direct_neighbors(a, b));
        direct_times.push(start.elapsed().as_nanos());
        let start = Instant::now();
        report = Some(std::hint::black_box(
            evaluate_change_impact(a, b, &context).expect("bounded benchmark"),
        ));
        recursive_times.push(start.elapsed().as_nanos());
    }
    direct_times.sort_unstable();
    recursive_times.sort_unstable();
    let report = report.unwrap();
    let recursive: BTreeSet<_> = report
        .affected_things
        .iter()
        .flat_map(|t| t.objects.iter().map(|o| o.object_id.clone()))
        .collect();
    let witnesses: Vec<_> = report
        .affected_things
        .iter()
        .flat_map(|t| &t.objects)
        .flat_map(|o| &o.witnesses)
        .collect();
    json!({"baselineHash":report.baseline.snapshot_hash,"targetHash":report.target.snapshot_hash,"nodes":a.objects.len(),"baselineEdges":a.relations.len(),"targetEdges":b.relations.len(),"changes":report.changes.len(),"directObjectCount":direct.len(),"recursiveObjectCount":recursive.len(),"onlyRecursive":recursive.difference(&direct).collect::<Vec<_>>(),"witnessCount":witnesses.len(),"witnessReferences":witnesses.iter().map(|w|w.object_ids.len()+w.relation_ids.len()).sum::<usize>(),"reportBytes":serde_json::to_vec(&report).unwrap().len(),"medianDirectNeighborNs":direct_times[3].to_string(),"medianFullReportNs":recursive_times[3].to_string(),"complete":report.complete,"evidence":report.evidence.iter().map(|e|json!({"id":e.evidence_id,"applicability":e.applicability,"provenance":e.provenance})).collect::<Vec<_>>(),"metrics":report.metrics.iter().map(|m|json!({"id":m.metric_id,"comparability":m.comparability,"delta":m.delta})).collect::<Vec<_>>()})
}
fn main() {
    let baseline = assistant_impact::snapshot("assistant-impact-baseline").unwrap();
    let bindings = assistant_impact::sample_evidence(&baseline).unwrap();
    let mut cases = BTreeMap::new();
    for id in assistant_impact::ids() {
        let target = assistant_impact::snapshot(id).unwrap();
        cases.insert(
            (*id).to_owned(),
            measure(&baseline, &target, bindings.clone()),
        );
    }
    let mut chain = baseline.clone();
    chain.objects.clear();
    chain.relations.clear();
    chain.theory.claims.clear();
    for i in 0..129 {
        chain.objects.push(ModelObject {
            id: format!("n{i:03}"),
            kind: "task".into(),
            title: format!("Task {i}"),
            thing_id: None,
            parent_id: None,
            properties: BTreeMap::new(),
            source: Source {
                kind: SourceKind::Declared,
                reference: "benchmark:synthetic".into(),
            },
        });
        if i > 0 {
            chain.relations.push(ModelRelation {
                id: format!("r{i:03}"),
                kind: "dependsOn".into(),
                from_id: format!("n{i:03}"),
                to_id: format!("n{:03}", i - 1),
                source: Source {
                    kind: SourceKind::Declared,
                    reference: "benchmark:synthetic".into(),
                },
            });
        }
    }
    let mut changed = chain.clone();
    changed.objects[0].title = "Changed input".into();
    cases.insert("128-hop-chain".into(), measure(&chain, &changed, vec![]));
    let output = json!({"schemaVersion":1,"runtime":"native","os":std::env::consts::OS,"arch":std::env::consts::ARCH,"profile":if cfg!(debug_assertions){"debug"}else{"release"},"packageVersion":env!("CARGO_PKG_VERSION"),"rulePack":"assistant-impact@1","engineCanonicalSourceHash":content_hash(&include_str!("../src/impact.rs")).unwrap(),"metricsCanonicalSourceHash":content_hash(&include_str!("../src/assistant_impact.rs")).unwrap(),"iterations":7,"timingInterpretation":"direct neighbor lookup and full validated recursive reports are different workloads; no speedup claim","cases":cases});
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}
