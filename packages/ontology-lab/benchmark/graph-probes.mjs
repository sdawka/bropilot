import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EXAMPLE_MESSAGES, EXAMPLE_PROPOSAL, applyProposal } from "../domain.mjs";

const fixture = JSON.parse(readFileSync(new URL("../../contracts/fixtures/assistant-valid.json", import.meta.url), "utf8"));
const clone = value => structuredClone(value);
const request = snapshot => ({ apiVersion: 1, snapshot, query: { kind: "readiness" } });
function baseline() { return clone(fixture); }
function proposalBoundary() {
  return applyProposal(fixture, "probe-false-entailment", {
    ...clone(EXAMPLE_PROPOSAL),
    title: "Private entries are automatically published to the public web",
    purpose: "The app publishes every private entry publicly without asking.",
    evidence: [{ messageId: "m1", quote: "personal assistant" }],
  }, EXAMPLE_MESSAGES).snapshot;
}
function finding(evaluation, ruleId) { return evaluation.findings.filter(item => item.ruleId === ruleId); }
function removeRelation(snapshot, id) { snapshot.relations = snapshot.relations.filter(item => item.id !== id); }
function addRelation(snapshot, id, kind, fromId, toId) {
  snapshot.relations.push({ id, kind, fromId, toId, source: { kind: "declared", reference: `probe:${id}` } });
}

const probes = [
  {
    id: "positive-baseline", expectation: "ready with no findings", blindSpot: "none expected",
    build: () => baseline(),
  },
  {
    id: "missing-edge-complete-scope", expectation: "blocker: assistant.outcome-requires-evaluation", blindSpot: "none expected",
    build: () => { const s = baseline(); removeRelation(s, "rel-evaluation"); return s; },
  },
  {
    id: "missing-edge-incomplete-scope", expectation: "unknown: assistant.outcome-requires-evaluation", blindSpot: "declared incomplete scope intentionally downgrades certainty",
    build: () => { const s = baseline(); removeRelation(s, "rel-evaluation"); const d = s.completeness.find(x => x.scopeId === "outcome-links"); d.status = "incomplete"; return s; },
  },
  {
    id: "dependency-cycle", expectation: "blocker: assistant.no-dependency-cycles", blindSpot: "only configured dependsOn cycles are detected",
    build: () => { const s = baseline(); addRelation(s, "cycle-planning-progress", "dependsOn", "planning-1", "progress-1"); addRelation(s, "cycle-progress-planning", "dependsOn", "progress-1", "planning-1"); return s; },
  },
  {
    id: "false-entailment", expectation: "semantic blind spot", blindSpot: "exact quote presence does not establish entailment",
    build: () => proposalBoundary(),
  },
  {
    id: "irrelevant-indicator", expectation: "semantic blind spot", blindSpot: "kind-correct measuredBy edge does not test relevance",
    build: () => { const s = baseline(); s.objects.find(x => x.id === "outcome-1").title = "Delete every account"; s.objects.find(x => x.id === "indicator-1").title = "French practice minutes"; return s; },
  },
  {
    id: "known-constraint-conflict", expectation: "blocker: assistant.constraints-compatible", blindSpot: "only predeclared constraint pairs are checked",
    build: () => { const s = baseline(); s.activeConstraints = ["routine-auto", "manual-only"]; return s; },
  },
  {
    id: "conflicting-authorization-prose", expectation: "semantic blind spot", blindSpot: "conflicting authorization prose is not contradiction checked",
    build: () => { const s = baseline(); s.objects.push({ id: "auth-conflict", kind: "authorizationRule", title: "Never ask before external changes", parentId: s.worldId, properties: {}, source: { kind: "declared", reference: "probe:auth-conflict" } }); addRelation(s, "rel-auth-conflict", "authorizedBy", "operation-plan", "auth-conflict"); return s; },
  },
  {
    id: "authorization-scope-mismatch", expectation: "semantic blind spot", blindSpot: "authorizedBy checks existence and endpoint types, not scope or operation semantics",
    build: () => { const s = baseline(); const op = s.objects.find(x => x.id === "operation-plan"); const rule = s.objects.find(x => x.id === "auth-routine"); op.title = "Delete all calendar events"; rule.title = "Assistant may schedule routine blocks"; return s; },
  },
  {
    id: "nonsense-assay-linked", expectation: "semantic blind spot", blindSpot: "verifiedBy checks acceptanceCriterion -> assay shape, not whether assay tests criterion",
    build: () => { const s = baseline(); s.objects.find(x => x.id === "criterion-1").title = "Never lose user data"; s.objects.find(x => x.id === "assay-1").title = "Check logo is blue"; return s; },
  },
];

export const GRAPH_PROBES = probes.map(({ build, ...probe }) => ({ ...probe, build }));

async function evaluate(snapshot, origin) {
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("--origin must be a credential-free loopback HTTP origin");
    const response = await fetch(`${url.origin}/api/v1/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request(snapshot)), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Rust API HTTP ${response.status}`);
    const body = await response.json();
    if (body?.status !== "ok" || body.result?.kind !== "readiness" || !body.result.evaluation) throw new Error(`Rust API returned ${body?.code ?? "invalid response"}`);
    return body;
  }
  const result = spawnSync(resolve("target/debug/bropilot-query"), { input: JSON.stringify(request(snapshot)), encoding: "utf8", timeout: 10_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  const body = JSON.parse(result.stdout);
  if (body?.status !== "ok" || body.result?.kind !== "readiness" || !body.result.evaluation) throw new Error(`Rust CLI returned ${body?.code ?? "invalid response"}`);
  return body;
}

export async function runGraphProbes({ origin } = {}) {
  const results = [];
  for (const probe of GRAPH_PROBES) {
    const response = await evaluate(probe.build(), origin);
    const evaluation = response.result?.evaluation;
    results.push({ id: probe.id, expectation: probe.expectation, blindSpot: probe.blindSpot, status: evaluation?.status ?? response.status, findings: (evaluation?.findings ?? []).map(item => ({ ruleId: item.ruleId, severity: item.severity, message: item.message })) });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--origin");
  runGraphProbes({ origin: index >= 0 ? process.argv[index + 1] : undefined }).then(results => process.stdout.write(`${JSON.stringify(results)}\n`)).catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
