import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function dataModule(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

async function loadHosted() {
  let source = await readFile(new URL("../apps/worker/src/hosted.ts", import.meta.url), "utf8");
  source = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const replacements = {
    "./identity.js": dataModule(`export const authenticateHosted = async () => globalThis.__hostedPrincipal;`),
    "./cloudflare/oauth.js": dataModule(`export {};`),
    "./cloudflare/deployment.js": dataModule(`export const deriveWorkerName = async (worldId, thingId) => \`bp-\${worldId}-\${thingId}\`;`),
    "./artifacts/native.js": dataModule(`export class CloudflareArtifactsProvider { constructor(binding) { this.binding = binding; } }`),
    "./artifacts/git-writer.js": dataModule(`export class IsomorphicGitWriter {}`),
    "./artifacts/source.js": dataModule(`
      export const computeSourceBundleDigest = (...args) => globalThis.__computeSourceDigest(...args);
      export const createWorldRepository = (...args) => globalThis.__createWorldRepository(...args);
      export const persistCandidateSource = (...args) => globalThis.__persistCandidateSource(...args);
      export const readPinnedSource = (...args) => globalThis.__readPinnedSource(...args);
      export const reconcileCanonical = (...args) => globalThis.__reconcileCanonical(...args);
    `),
    "./artifacts/packages.js": dataModule(`
      export const retainBuildPackage = (...args) => globalThis.__retainBuildPackage(...args);
      export const loadVerifiedPackage = (...args) => globalThis.__loadVerifiedPackage(...args);
    `),
    "./runner-manifest.js": dataModule(`export const RUNNER_HASH = "runner-hash"; export const RUNNER_REF = "hosted-runner@1";`),
  };
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function request(path, body, headers = {}) {
  return new Request(`https://app.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? headers : {
      "content-type": "application/json",
      origin: "https://app.test",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function worldState(overrides = {}) {
  return {
    worldId: "world-1",
    title: "World One",
    headRevisionId: "revision-1",
    desired: { revisionId: "desired-1" },
    hosted: { deploymentTargets: [] },
    candidates: [],
    revisions: [],
    runs: [],
    deployments: [],
    ...overrides,
  };
}

function harness({ state = worldState(), owner = "owner-1", preview, execute, claimedJob } = {}) {
  const calls = {
    execute: [], preview: [], upsert: [], receipts: [], receiptReads: [], reservations: [],
    repositoryWrites: [], reconciliations: [], reconciliationEvents: [], workflows: [],
  };
  let repository = { namespace: "bropilot-worlds", repoId: "repo-1", repoName: "world-1", mainCommitSha: "a".repeat(40) };
  let reconciledRevisionId = null;
  const packageReservations = new Map();
  const stub = {
    async getOwnerPrincipalId() { return owner; },
    async getState() { return state; },
    async getRunnableJobs() { return state.runs.map(({ runId }) => ({ worldId: state.worldId, runId })); },
    async previewWithPrincipal(actor, principal, nowMs, command) {
      calls.preview.push({ actor, principal, nowMs, command });
      return preview ?? { apiVersion: 1, status: "ok", state, result: { kind: "candidateSubmitted" } };
    },
    async executeWithPrincipal(actor, principal, nowMs, command) {
      calls.execute.push({ actor, principal, nowMs, command });
      return execute?.(command, state) ?? { apiVersion: 1, status: "ok", state, result: { kind: "accepted" } };
    },
    async getClaimedJob(runId, leaseId) {
      return typeof claimedJob === "function" ? claimedJob(runId, leaseId) : claimedJob;
    },
    async getSourceRepository() { return repository; },
    async saveSourceRepository(next) {
      calls.repositoryWrites.push(next);
      calls.reconciliationEvents.push({ kind: "repository", value: next });
      repository = next;
    },
    async getSourceReconciliation() {
      const revision = state.revisions.find(item => item.revisionId === state.headRevisionId);
      if (!revision?.candidateId) return null;
      return { revisionId: state.headRevisionId, status: reconciledRevisionId === state.headRevisionId ? "current" : "pending" };
    },
    async markSourceReconciled(revisionId) {
      calls.reconciliations.push(revisionId);
      calls.reconciliationEvents.push({ kind: "mark", value: revisionId });
      if (state.headRevisionId === revisionId) reconciledRevisionId = revisionId;
    },
    async reservePackageUpload(runId, leaseId, principalId, uploadDigest, nowMs) {
      calls.reservations.push({ runId, leaseId, principalId, uploadDigest, nowMs });
      const key = `${runId}/${leaseId}`;
      const existing = packageReservations.get(key);
      if (existing) return existing.principalId === principalId && existing.uploadDigest === uploadDigest;
      packageReservations.set(key, { principalId, uploadDigest });
      return true;
    },
    async savePackageReceipt(runId, leaseId, principalId, packageRef, nowMs) {
      calls.receipts.push({ runId, leaseId, principalId, packageRef, nowMs });
    },
    async getPackageReceipt(runId, leaseId, principalId) {
      calls.receiptReads.push({ runId, leaseId, principalId });
      return calls.receipts.find(item => item.runId === runId && item.leaseId === leaseId && item.principalId === principalId)?.packageRef ?? null;
    },
  };
  const directory = { async list() { return []; }, async upsert(summary) { calls.upsert.push(summary); } };
  const env = {
    AUTH_MODE: "hosted",
    ARTIFACTS: {},
    ARTIFACTS_NAMESPACE: "bropilot-worlds",
    BUILD_PACKAGES: {},
    WORLD_AUTHORITY: { getByName() { return stub; } },
    LOCAL_WORLD_DIRECTORY: { getByName() { return directory; } },
  };
  return { env, stub, calls };
}

test("hosted World access is isolated to its human owner and World-scoped services", async () => {
  const { hostedRoute } = await loadHosted();
  const { env } = harness();

  globalThis.__hostedPrincipal = { principalId: "owner-1", kind: "human" };
  assert.equal((await hostedRoute(request("/api/v1/worlds/world-1"), env, "/api/v1/worlds/world-1", {})).status, 200);

  globalThis.__hostedPrincipal = { principalId: "owner-2", kind: "human" };
  assert.equal((await hostedRoute(request("/api/v1/worlds/world-1"), env, "/api/v1/worlds/world-1", {})).status, 403);

  globalThis.__hostedPrincipal = { principalId: "agent-1", kind: "service", role: "implementer", worldId: "world-2", operations: ["submitHostedCandidate"] };
  assert.equal((await hostedRoute(request("/api/v1/worlds/world-1"), env, "/api/v1/worlds/world-1", {})).status, 403);
});

test("verifier job listing requires the registered runner, header, World, and claim scope", async () => {
  const { hostedRoute } = await loadHosted();
  const { env } = harness({ state: worldState({ runs: [{ runId: "run-1" }] }) });
  const path = "/api/v1/verifier/jobs";

  globalThis.__hostedPrincipal = { principalId: "verifier-1", kind: "service", role: "verifier", worldId: "world-1", runnerHash: "runner-hash", operations: [] };
  assert.equal((await hostedRoute(request(path, undefined, { "x-bropilot-runner-hash": "runner-hash" }), env, path, {})).status, 403);

  globalThis.__hostedPrincipal = { ...globalThis.__hostedPrincipal, operations: ["claimRun"] };
  assert.equal((await hostedRoute(request(path, undefined, { "x-bropilot-runner-hash": "wrong" }), env, path, {})).status, 403);
  const response = await hostedRoute(request(path, undefined, { "x-bropilot-runner-hash": "runner-hash" }), env, path, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { jobs: [{ worldId: "world-1", runId: "run-1" }] });
});

test("candidate preview rejection happens before any source provider write", async () => {
  const { hostedRoute } = await loadHosted();
  const preview = { apiVersion: 1, status: "error", code: "not_found", message: "Move not found" };
  const { env, calls } = harness({ preview });
  let writes = 0;
  globalThis.__computeSourceDigest = async () => "c".repeat(64);
  globalThis.__persistCandidateSource = async () => { writes += 1; throw new Error("must not write"); };
  globalThis.__reconcileCanonical = async () => { throw new Error("must not reconcile"); };
  globalThis.__hostedPrincipal = {
    principalId: "implementer-1", kind: "service", role: "implementer", worldId: "world-1",
    moveId: "move-1", operations: ["submitHostedCandidate"], expiresAtMs: Date.now() + 60_000,
  };
  const path = "/api/v1/worlds/world-1/commands";
  const response = await hostedRoute(request(path, {
    kind: "submitCandidate", moveId: "missing-move", candidateId: "candidate-1",
    source: { files: { "worker.ts": "export default {}" } }, requestId: "submit-1",
  }), env, path, {});

  assert.equal(response.status, 404);
  assert.equal(writes, 0);
  assert.equal(calls.preview.length, 1);
  assert.equal(calls.preview[0].principal.moveId, "move-1");
  assert.deepEqual(calls.preview[0].principal.operations, ["submitHostedCandidate"]);
  assert.equal(calls.execute.length, 0);
});

test("claim, package, and completion use server-issued leases and retained receipts", async () => {
  const { hostedRoute } = await loadHosted();
  const sourceRef = {
    namespace: "bropilot-worlds", repoId: "repo-1", repoName: "world-1",
    commitSha: "a".repeat(40), treeSha: "b".repeat(40), contentDigest: "c".repeat(64),
  };
  const run = {
    runId: "run-1", candidateId: "candidate-1", attempt: 0, status: "queued",
    sourceDigest: sourceRef.contentDigest, contractHash: "d".repeat(64), planHash: "e".repeat(64),
  };
  const state = worldState({ runs: [run] });
  const { env, calls } = harness({
    state,
    execute(command) {
      if (command.kind === "claimRun") {
        run.status = "running";
        run.activeLease = { leaseId: command.leaseId, verifierId: "verifier-1", expiresAtMs: Date.now() + 60_000 };
      }
      return { apiVersion: 1, status: "ok", state, result: { kind: command.kind } };
    },
    claimedJob(runId, leaseId) {
      return { worldId: "world-1", runId, candidateId: "candidate-1", leaseId,
        sourceDigest: run.sourceDigest, sourceRef, contractHash: run.contractHash, planHash: run.planHash,
        runnerHash: "runner-hash" };
    },
  });
  globalThis.__hostedPrincipal = {
    principalId: "verifier-1", kind: "service", role: "verifier", worldId: "world-1",
    runnerHash: "runner-hash", operations: ["claimRun", "completeHostedRun"], expiresAtMs: Date.now() + 60_000,
  };
  globalThis.__readPinnedSource = async () => ({ files: { "worker.ts": "export default {}" } });
  const pathBase = "/api/v1/worlds/world-1/runs/run-1";
  const runnerHeaders = { "x-bropilot-runner-hash": "runner-hash" };
  const claim = await hostedRoute(request(`${pathBase}/claim`, { runnerHash: "runner-hash", leaseId: "caller-lease" }, runnerHeaders), env, `${pathBase}/claim`, {});
  assert.equal(claim.status, 200);
  const claimed = await claim.json();
  assert.notEqual(claimed.job.leaseId, "caller-lease");
  assert.match(claimed.job.leaseId, /^[0-9a-f-]{36}$/i);

  const receipt = {
    key: `packages/sha256/${"f".repeat(64)}/manifest.json`, packageDigest: "f".repeat(64),
    buildDigest: "1".repeat(64), sourceDigest: run.sourceDigest, sourceRef,
    contractHash: run.contractHash, planHash: run.planHash, runnerHash: "runner-hash", runId: run.runId,
  };
  let retainCalls = 0;
  globalThis.__retainBuildPackage = async (_bucket, _upload, job) => {
    retainCalls += 1;
    assert.equal(job.leaseId, claimed.job.leaseId);
    assert.equal(job.sourceRef, sourceRef);
    return receipt;
  };
  globalThis.__loadVerifiedPackage = async (_bucket, ref) => {
    assert.equal(ref, receipt);
    return { manifest: { packageDigest: receipt.packageDigest }, compiledWorker: new Uint8Array(), assets: {} };
  };
  const packaged = await hostedRoute(request(`${pathBase}/package`, {
    leaseId: claimed.job.leaseId, requestId: "package-1", upload: { compiledWorker: "caller bytes" },
  }, runnerHeaders), env, `${pathBase}/package`, {});
  assert.equal(packaged.status, 200);
  assert.equal(calls.receipts.length, 1);
  assert.equal(retainCalls, 1);

  const repeated = await hostedRoute(request(`${pathBase}/package`, {
    leaseId: claimed.job.leaseId, requestId: "package-repeat", upload: { compiledWorker: "caller bytes" },
  }, runnerHeaders), env, `${pathBase}/package`, {});
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { packageRef: receipt });
  assert.equal(retainCalls, 1);
  assert.equal(calls.receipts.length, 1);
  const readsAfterRepeat = calls.receiptReads.length;

  const conflicting = await hostedRoute(request(`${pathBase}/package`, {
    leaseId: claimed.job.leaseId, requestId: "package-conflict", upload: { compiledWorker: "different bytes" },
  }, runnerHeaders), env, `${pathBase}/package`, {});
  assert.equal(conflicting.status, 409);
  assert.equal((await conflicting.json()).code, "package_upload_conflict");
  assert.equal(retainCalls, 1);
  assert.equal(calls.receiptReads.length, readsAfterRepeat);
  assert.equal(calls.receipts.length, 1);

  const forged = { ...receipt, key: "caller-selected", buildDigest: "0".repeat(64) };
  const completion = await hostedRoute(request(`${pathBase}/complete`, {
    runId: run.runId, leaseId: claimed.job.leaseId, sourceDigest: run.sourceDigest,
    contractHash: run.contractHash, planHash: run.planHash, packageRef: forged,
    observations: [], requestId: "complete-1",
  }, runnerHeaders), env, `${pathBase}/complete`, {});
  assert.equal(completion.status, 200);
  assert.equal(calls.execute.at(-1).command.packageRef, receipt);
  assert.notEqual(calls.execute.at(-1).command.packageRef.key, forged.key);
});

test("failed promotion reconciliation blocks deployment and resume until an owner retry succeeds", async () => {
  const { hostedRoute } = await loadHosted();
  const sourceRef = {
    namespace: "bropilot-worlds", repoId: "repo-1", repoName: "world-1",
    commitSha: "b".repeat(40), treeSha: "c".repeat(40), contentDigest: "d".repeat(64),
  };
  const state = worldState({
    headRevisionId: "revision-base",
    candidates: [{ candidateId: "candidate-1", sourceRef }],
    revisions: [
      { revisionId: "revision-base" },
      { revisionId: "revision-promoted", candidateId: "candidate-1" },
    ],
    hosted: { deploymentTargets: [{ targetId: "web-app", thingId: "web-app", connectionId: "connection-1", accountId: "a".repeat(32), ownerPrincipalId: "owner-1" }] },
    deployments: [{ deploymentId: "deployment-resume", status: "queued" }],
  });
  const { env, calls } = harness({
    state,
    execute(command) {
      if (command.kind === "promote") state.headRevisionId = "revision-promoted";
      return { apiVersion: 1, status: "ok", state, result: { kind: command.kind } };
    },
  });
  env.CLOUDFLARE_CONNECTIONS = { getByName() { return { async listMetadata() { return [{ connectionId: "connection-1", accountId: "a".repeat(32), reconnectRequired: false }]; } }; } };
  env.DEPLOYMENT_WORKFLOW = {
    async create(input) { calls.workflows.push(input); return {}; },
    async get() { throw new Error("unexpected workflow retry"); },
  };
  let storageAvailable = false;
  let reconcileAttempts = 0;
  globalThis.__reconcileCanonical = async (_provider, _writer, input) => {
    reconcileAttempts += 1;
    assert.equal(input.sourceRef, sourceRef);
    if (!storageAvailable) throw new Error("provider unavailable");
    return { mainCommitSha: "e".repeat(40) };
  };
  globalThis.__hostedPrincipal = { principalId: "owner-1", kind: "human", expiresAtMs: Date.now() + 60_000 };
  const commandsPath = "/api/v1/worlds/world-1/commands";

  const promoted = await hostedRoute(request(commandsPath, {
    kind: "promote", candidateId: "candidate-1", expectedHeadRevisionId: "revision-base", requestId: "promote-1",
  }), env, commandsPath, {});
  assert.equal(promoted.status, 200);
  assert.equal((await promoted.json()).storageReconciliation, "pending");

  const world = await hostedRoute(request("/api/v1/worlds/world-1"), env, "/api/v1/worlds/world-1", {});
  assert.deepEqual((await world.json()).sourceReconciliation, { revisionId: "revision-promoted", status: "pending" });

  const resumePath = "/api/v1/worlds/world-1/deployments/deployment-resume/resume";
  const blockedResume = await hostedRoute(request(resumePath, {}), env, resumePath, {});
  assert.equal(blockedResume.status, 503);
  assert.equal((await blockedResume.json()).code, "source_reconciliation_pending");
  assert.equal(calls.workflows.length, 0);

  const blockedDeployment = await hostedRoute(request(commandsPath, {
    kind: "requestDeployment", deploymentId: "deployment-new", targetId: "web-app",
    revisionId: "revision-promoted", expectedHeadRevisionId: "revision-promoted", requestId: "deploy-blocked",
  }), env, commandsPath, {});
  assert.equal(blockedDeployment.status, 503);
  assert.equal((await blockedDeployment.json()).code, "source_reconciliation_pending");
  assert.deepEqual(calls.execute.map(call => call.command.kind), ["promote"]);
  assert.equal(calls.workflows.length, 0);

  storageAvailable = true;
  const reconciliationPath = "/api/v1/worlds/world-1/source-reconciliation";
  const retried = await hostedRoute(request(reconciliationPath, {}), env, reconciliationPath, {});
  assert.equal(retried.status, 200);
  assert.deepEqual(await retried.json(), {
    state,
    sourceReconciliation: { revisionId: "revision-promoted", status: "current" },
  });
  assert.deepEqual(calls.reconciliationEvents.map(event => event.kind), ["repository", "mark"]);
  assert.equal(calls.repositoryWrites[0].mainCommitSha, "e".repeat(40));

  const accepted = await hostedRoute(request(commandsPath, {
    kind: "requestDeployment", deploymentId: "deployment-new", targetId: "web-app",
    revisionId: "revision-promoted", expectedHeadRevisionId: "revision-promoted", requestId: "deploy-retry",
  }), env, commandsPath, {});
  assert.equal(accepted.status, 200);
  assert.deepEqual(calls.execute.map(call => call.command.kind), ["promote", "requestDeployment"]);
  assert.equal(calls.workflows.length, 1);
  assert.equal(reconcileAttempts, 5);
});

test("deployment requests reject forged protected refs and dispatch only server-derived identifiers", async () => {
  const { hostedRoute } = await loadHosted();
  const state = worldState({
    hosted: { deploymentTargets: [{ targetId: "web-app", thingId: "web-app", connectionId: "connection-1", accountId: "a".repeat(32), ownerPrincipalId: "owner-1" }] },
    deployments: [{ deploymentId: "deployment-1", status: "queued" }],
  });
  const { env, calls } = harness({ state });
  env.CLOUDFLARE_CONNECTIONS = { getByName() { return { async listMetadata() { return [{ connectionId: "connection-1", accountId: "a".repeat(32), reconnectRequired: false }]; } }; } };
  env.DEPLOYMENT_WORKFLOW = {
    async create(input) { calls.workflows.push(input); return {}; },
    async get() { throw new Error("unexpected workflow retry"); },
  };
  globalThis.__hostedPrincipal = { principalId: "owner-1", kind: "human", expiresAtMs: Date.now() + 60_000 };
  const path = "/api/v1/worlds/world-1/commands";
  const forged = await hostedRoute(request(path, {
    kind: "requestDeployment", targetId: "web-app", deploymentId: "deployment-forged",
    packageRef: { packageDigest: "f".repeat(64) }, requestId: "deploy-forged",
  }), env, path, {});
  assert.equal(forged.status, 400);
  assert.equal(calls.execute.length, 0);
  assert.equal(calls.workflows.length, 0);

  const accepted = await hostedRoute(request(path, {
    kind: "requestDeployment", targetId: "web-app", deploymentId: "deployment-1", requestId: "deploy-1",
  }), env, path, {});
  assert.equal(accepted.status, 200);
  assert.equal(calls.workflows.length, 1);
  assert.deepEqual(calls.workflows[0].params, { worldId: "world-1", deploymentId: "deployment-1" });
  assert.match(calls.workflows[0].id, /^deployment-[a-f0-9]{64}$/);
});
