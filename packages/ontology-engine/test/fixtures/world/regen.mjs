// Regenerates the world-core readiness oracle for every World snapshot fixture.
// Usage (from the repository root): node packages/ontology-engine/test/fixtures/world/regen.mjs
// Builds `bropilot-query` with `cargo build --locked -p bropilot-query`, sends each snapshot as
// `{ apiVersion: 1, snapshot, query: { kind: "readiness" } }` and writes the evaluation's status and findings
// to expected/<fixture>.readiness.json. Each mutation in mutations.json is applied to assistant-valid and
// written to expected/mutation-<name>.readiness.json the same way.
import { applyMutation } from "./mutate.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../..");
const fixtures = join(root, "packages/contracts/fixtures");
const out = join(here, "expected");
export const MUTATION_BASE = "assistant-valid";

/** Every assistant fixture that is a WorldSnapshot; `assistant-impact-evidence.json` holds evidence bindings. */
export const WORLD_FIXTURES = [
  "assistant-valid", "assistant-missing", "assistant-conflict", "assistant-unknown",
  "assistant-impact-baseline", "assistant-impact-calendar-adapter", "assistant-impact-completion",
  "assistant-impact-incomplete", "assistant-impact-interface", "assistant-impact-metric-definition",
  "assistant-impact-removed-dependency",
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  execFileSync("cargo", ["build", "--locked", "-p", "bropilot-query"], { cwd: root, stdio: "inherit" });
  const bin = join(root, "target/debug/bropilot-query");
  const load = (name) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
  const mutations = JSON.parse(readFileSync(join(here, "mutations.json"), "utf8"));
  const cases = [
    ...WORLD_FIXTURES.map((name) => ({ name, fixture: `packages/contracts/fixtures/${name}.json`, snapshot: load(name) })),
    ...mutations.map((m) => ({
      name: `mutation-${m.name}`, fixture: `packages/contracts/fixtures/${MUTATION_BASE}.json + mutations.json#${m.name}`,
      snapshot: applyMutation(load(MUTATION_BASE), m),
    })),
  ];
  for (const { name, fixture, snapshot } of cases) {
    const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: "readiness" } });
    const response = JSON.parse(execFileSync(bin, { cwd: root, input, encoding: "utf8", maxBuffer: 1 << 24 }));
    if (response.status !== "ok") throw new Error(`${name}: ${response.code} ${response.message}`);
    const e = response.result.evaluation;
    const expected = {
      fixture,
      evaluatorVersion: e.evaluatorVersion,
      snapshotHash: e.snapshotHash,
      templateHash: e.templateHash,
      status: e.status,
      findings: e.findings,
    };
    writeFileSync(join(out, `${name}.readiness.json`), `${JSON.stringify(expected, null, 2)}\n`);
    console.log(`${name}: ${e.status}, ${e.findings.length} findings`);
  }
}
