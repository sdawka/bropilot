import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RUNNER_ID,
  computeSourceDigest,
  getRunnerHash,
  verifyJob,
} from "../src/index.mjs";
import {
  brokenHealthSource,
  compileErrorSource,
  forbiddenImportSource,
  hangingHealthSource,
  networkSource,
  oversizedResponseSource,
  validSource,
} from "./fixtures/source-bundles.mjs";

async function job(source = validSource, overrides = {}) {
  return {
    worldId: "world-1",
    runId: "run-1",
    candidateId: "candidate-1",
    leaseId: "lease-1",
    sourceDigest: computeSourceDigest(source),
    contractHash: "contract-hash",
    planHash: "plan-hash",
    runnerHash: await getRunnerHash(),
    source,
    ...overrides,
  };
}

function assay(completion, assayId) {
  return completion.observations.find((item) => item.assayId === assayId);
}

test("valid full-stack source builds and passes all protected checks", async () => {
  assert.equal(RUNNER_ID, "local-worker@1");
  const completion = await verifyJob(await job());

  assert.match(completion.buildDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    completion.observations.map(({ assayId, executionStatus, result }) => ({
      assayId,
      executionStatus,
      result,
    })),
    [
      { assayId: "artifact.exists", executionStatus: "completed", result: "pass" },
      { assayId: "artifact.build-start", executionStatus: "completed", result: "pass" },
      { assayId: "app.health", executionStatus: "completed", result: "pass" },
      { assayId: "app.surfaces", executionStatus: "completed", result: "pass" },
    ],
  );
});

test("missing protected artifact fails inspection and does not run later checks", async () => {
  const source = { files: { "worker.ts": validSource.files["worker.ts"] } };
  const completion = await verifyJob(await job(source));

  assert.equal(assay(completion, "artifact.exists").result, "fail");
  assert.deepEqual(
    completion.observations.slice(1).map((item) => item.executionStatus),
    ["notRun", "notRun", "notRun"],
  );
});

test("broken health fails only the health contract", async () => {
  const completion = await verifyJob(await job(brokenHealthSource));

  assert.equal(assay(completion, "artifact.build-start").result, "pass");
  assert.equal(assay(completion, "app.health").result, "fail");
  assert.equal(assay(completion, "app.surfaces").result, "pass");
});

test("compile error fails build and leaves runtime checks not run", async () => {
  const completion = await verifyJob(await job(compileErrorSource));

  assert.equal(assay(completion, "artifact.exists").result, "pass");
  assert.equal(assay(completion, "artifact.build-start").result, "fail");
  assert.equal(assay(completion, "app.health").executionStatus, "notRun");
  assert.equal(completion.buildDigest, null);
});

test("package, node, and remote imports are rejected by the protected builder", async () => {
  const completion = await verifyJob(await job(forbiddenImportSource));

  assert.equal(assay(completion, "artifact.build-start").result, "fail");
  assert.match(assay(completion, "artifact.build-start").raw, /only relative source imports/i);
});

test("candidate outbound network is denied", async () => {
  const completion = await verifyJob(await job(networkSource));

  assert.equal(assay(completion, "artifact.build-start").result, "pass");
  assert.equal(assay(completion, "app.health").result, "fail");
  assert.match(assay(completion, "app.health").raw, /403|outbound/i);
});

test("runner and source digest mismatches stop before execution", async () => {
  await assert.rejects(
    verifyJob(await job(validSource, { runnerHash: "0".repeat(64) })),
    { code: "runner_hash_mismatch" },
  );
  await assert.rejects(
    verifyJob(await job(validSource, { sourceDigest: "0".repeat(64) })),
    { code: "source_digest_mismatch" },
  );
});

test("source digest uses a sorted ASCII-path record compatible with Rust BTreeMap serialization", () => {
  assert.equal(
    computeSourceDigest({ files: { "b.txt": "B", "a.txt": "A" } }),
    "bde944504e8633b26fb9f7e2b32d9e7a27e6a4688e03968a95020a00c24aafac",
  );
  assert.throws(
    () => computeSourceDigest({ files: { "../escape.ts": "no" } }),
    { code: "invalid_source_path" },
  );
});

test("repeated verification is deterministic", async () => {
  const input = await job();
  const first = await verifyJob(input);
  const second = await verifyJob(input);

  assert.equal(first.buildDigest, second.buildDigest);
  assert.deepEqual(first.observations, second.observations);
});

test("successful verification exposes the exact deployable package to a retention callback", async () => {
  const input = await job();
  let retained;
  const packageRef = {
    key: "packages/sha256/package/manifest.json",
    packageDigest: "1".repeat(64),
    buildDigest: "2".repeat(64),
    sourceDigest: input.sourceDigest,
    sourceRef: input.sourceRef,
    contractHash: input.contractHash,
    planHash: input.planHash,
    runnerHash: input.runnerHash,
    runId: input.runId,
  };
  const completion = await verifyJob(input, {
    retainPackage: async (upload, receivedJob) => {
      retained = { upload, receivedJob };
      return packageRef;
    },
  });

  assert.equal(retained.receivedJob, input);
  assert.match(retained.upload.compiledWorker, /fetch/);
  assert.equal(retained.upload.assets["public/index.html"], validSource.files["public/index.html"]);
  assert.equal(retained.upload.buildDigest, completion.buildDigest);
  assert.ok(!Object.hasOwn(retained.upload.deployableConfig, "outboundNetwork"));
  assert.equal(completion.packageRef, packageRef);
});

test("failed compilation never invents or retains a package", async () => {
  let retainCalls = 0;
  const completion = await verifyJob(await job(compileErrorSource), {
    retainPackage: async () => {
      retainCalls += 1;
      return {};
    },
  });

  assert.equal(retainCalls, 0);
  assert.equal(completion.buildDigest, null);
  assert.ok(!Object.hasOwn(completion, "packageRef"));
});

test("oversized candidate responses are bounded and fail the surface assay", async () => {
  const completion = await verifyJob(await job(oversizedResponseSource));
  const surfaces = assay(completion, "app.surfaces");

  assert.equal(surfaces.result, "fail");
  assert.ok(Buffer.byteLength(surfaces.raw) <= 8 * 1024);
  assert.match(surfaces.raw, /tooLarge/);
});

test("hanging candidate probe times out and the child is cleaned up", async () => {
  const started = Date.now();
  const completion = await verifyJob(await job(hangingHealthSource));
  const elapsed = Date.now() - started;

  assert.equal(assay(completion, "app.health").result, "fail");
  assert.match(assay(completion, "app.health").raw, /deadline|abort|hung|canceled/i);
  assert.ok(elapsed < 8_000, `expected bounded cleanup, took ${elapsed}ms`);
});

test("abort signal terminates the active verifier child process group", async () => {
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 50);

  await assert.rejects(verifyJob(await job(validSource), { signal: controller.signal }), {
    code: "verifier_aborted",
  });
  assert.ok(Date.now() - started < 2_000);
});
