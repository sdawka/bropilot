use bropilot_core::{
    CompiledRulePack, EVALUATOR_VERSION, assistant_impact, compiled_rule_pack_catalog, fixtures,
    typescript_contract,
};
use serde::Serialize;
use std::{env, fs, path::PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureCatalog<'a> {
    api_version: u32,
    fixtures: Vec<FixtureEntry<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureEntry<'a> {
    id: &'a str,
    title: &'a str,
    description: &'a str,
    snapshot_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCatalog<'a> {
    evaluator_version: &'a str,
    compiled_rule_packs: Vec<CompiledRulePack>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = env::args_os()
        .nth(1)
        .map_or_else(|| PathBuf::from("packages/contracts"), PathBuf::from);
    let fixture_dir = output.join("fixtures");
    fs::create_dir_all(&fixture_dir)?;
    fs::write(
        output.join("index.ts"),
        format!("{}\n", typescript_contract().trim_end()),
    )?;
    fs::write(
        output.join("package.json"),
        concat!(
            "{\n",
            "  \"name\": \"@bropilot/contracts\",\n",
            "  \"version\": \"0.1.0\",\n",
            "  \"private\": true,\n",
            "  \"type\": \"module\",\n",
            "  \"exports\": {\n",
            "    \".\": \"./index.ts\",\n",
            "    \"./fixtures/*\": \"./fixtures/*\"\n",
            "  }\n",
            "}\n"
        ),
    )?;

    let metadata = [
        (
            "assistant-valid",
            "Ready assistant",
            "All declared foundation obligations are satisfied.",
        ),
        (
            "assistant-missing",
            "Missing evaluation plan",
            "A required link is absent in a complete scope.",
        ),
        (
            "assistant-conflict",
            "Conflicting assistant",
            "A forbidden dependency cycle and incompatible policies block readiness.",
        ),
        (
            "assistant-unknown",
            "Unknown assistant",
            "A mandatory relation scope is incomplete, so readiness remains unknown.",
        ),
        (
            "assistant-impact-baseline",
            "Assistant impact baseline",
            "Synthetic plans, completion observations and pinned advisory evidence.",
        ),
        (
            "assistant-impact-calendar-adapter",
            "Calendar adapter change",
            "Synthetic adapter revision propagates through explicit functional dependencies.",
        ),
        (
            "assistant-impact-completion",
            "Completion observation change",
            "Synthetic completion inputs change the completed versus planned work metric.",
        ),
        (
            "assistant-impact-interface",
            "Interface-only change",
            "An interface edit does not invent upstream consequences.",
        ),
        (
            "assistant-impact-removed-dependency",
            "Removed dependency",
            "Baseline-only dependencies retain exact explanation paths.",
        ),
        (
            "assistant-impact-metric-definition",
            "Metric definition change",
            "The fixed variant includes cancelled planned tasks.",
        ),
        (
            "assistant-impact-incomplete",
            "Incomplete impact coverage",
            "Known impacts remain visible while incomplete coverage stays unknown.",
        ),
    ];
    let catalog = FixtureCatalog {
        api_version: 1,
        fixtures: metadata
            .iter()
            .map(|(id, title, description)| FixtureEntry {
                id,
                title,
                description,
                snapshot_path: format!("./{id}.json"),
            })
            .collect(),
    };
    fs::write(
        fixture_dir.join("catalog.json"),
        format!("{}\n", serde_json::to_string_pretty(&catalog)?),
    )?;
    fs::write(
        fixture_dir.join("runtime-catalog.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&RuntimeCatalog {
                evaluator_version: EVALUATOR_VERSION,
                compiled_rule_packs: compiled_rule_pack_catalog(),
            })?
        ),
    )?;
    for id in fixtures::ids() {
        let snapshot = fixtures::snapshot(id).expect("catalog fixture exists");
        fs::write(
            fixture_dir.join(format!("{id}.json")),
            format!("{}\n", serde_json::to_string_pretty(&snapshot)?),
        )?;
    }
    let mut evidence = std::collections::BTreeMap::new();
    for id in assistant_impact::ids() {
        let snapshot = assistant_impact::snapshot(id).expect("impact catalog fixture exists");
        evidence.insert(
            snapshot.revision_id.clone(),
            assistant_impact::sample_evidence(&snapshot)
                .map_err(|error| format!("impact evidence: {error:?}"))?,
        );
        fs::write(
            fixture_dir.join(format!("{id}.json")),
            format!("{}\n", serde_json::to_string_pretty(&snapshot)?),
        )?;
    }
    fs::write(
        fixture_dir.join("assistant-impact-evidence.json"),
        format!("{}\n", serde_json::to_string_pretty(&evidence)?),
    )?;
    Ok(())
}
