import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { main } from "../src/cli.mjs";
import { computeSourceDigest, getRunnerHash } from "../src/index.mjs";
import { validSource } from "./fixtures/source-bundles.mjs";

test("CLI claims and completes queued jobs with private bearer and runner headers", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-test-"));
  const tokenFile = path.join(directory, "token");
  const token = "private-test-token";
  await writeFile(tokenFile, token, { mode: 0o600 });
  const runnerHash = await getRunnerHash();
  const source = { files: { "worker.ts": "export default { fetch() { return new Response(); } };" } };
  const claimedJob = {
    worldId: "world-1",
    runId: "run-1",
    candidateId: "candidate-1",
    leaseId: "lease-1",
    sourceDigest: computeSourceDigest(source),
    contractHash: "contract-1",
    planHash: "plan-1",
    runnerHash,
    source,
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const headers = { "content-type": "application/json" };
    if (String(url).endsWith("/jobs")) {
      return new Response(JSON.stringify({ jobs: [{ worldId: "world-1", runId: "run-1" }] }), { headers });
    }
    if (String(url).endsWith("/claim")) {
      return new Response(JSON.stringify({ job: claimedJob }), { headers });
    }
    return new Response(JSON.stringify({ ok: true }), { headers });
  };
  try {
    await main(["--origin", "http://127.0.0.1:8787", "--token-file", tokenFile]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.init.headers.authorization, `Bearer ${token}`);
    assert.equal(call.init.headers["x-bropilot-runner-hash"], runnerHash);
  }
  assert.deepEqual(JSON.parse(calls[1].init.body), { runnerHash });
  const completion = JSON.parse(calls[2].init.body);
  assert.equal(completion.runId, "run-1");
  assert.equal(completion.observations[0].assayId, "artifact.exists");
  assert.equal(completion.observations[0].result, "fail");
  assert.ok(!calls[2].init.body.includes(token));
});

test("watch mode retries a transient API restart without exposing the underlying error", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-watch-"));
  const tokenFile = path.join(directory, "token");
  const token = "watch-private-token";
  await writeFile(tokenFile, token, { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  const originalStderrWrite = process.stderr.write;
  let attempts = 0;
  let stderr = "";
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error(`hot reload exposed ${token}`);
    process.emit("SIGTERM");
    return new Response(JSON.stringify({ jobs: [] }), {
      headers: { "content-type": "application/json" },
    });
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    await main([
      "--origin",
      "http://127.0.0.1:8787",
      "--token-file",
      tokenFile,
      "--watch",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    process.stderr.write = originalStderrWrite;
  }

  assert.equal(attempts, 2);
  assert.match(stderr, /watch retry/i);
  assert.ok(!stderr.includes(token));
  assert.ok(!stderr.includes("hot reload exposed"));
});

test("one-shot mode fails explicitly on a transient API restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-once-"));
  const tokenFile = path.join(directory, "token");
  await writeFile(tokenFile, "once-private-token", { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("hot reload details");
  };
  try {
    await assert.rejects(
      main(["--origin", "http://127.0.0.1:8787", "--token-file", tokenFile]),
      /API request failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("watch mode does not retry an authentication failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-auth-"));
  const tokenFile = path.join(directory, "token");
  await writeFile(tokenFile, "auth-private-token", { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts > 1) process.emit("SIGTERM");
    return new Response("unauthorized", { status: 401 });
  };
  try {
    await assert.rejects(
      main(["--origin", "http://127.0.0.1:8787", "--token-file", tokenFile, "--watch"]),
      /HTTP 401/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(attempts, 1);
});

test("hosted mode retains the verified build before completing with its protected package reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-hosted-"));
  const tokenFile = path.join(directory, "token");
  await writeFile(tokenFile, "hosted-private-token", { mode: 0o600 });
  const runnerHash = await getRunnerHash();
  const sourceDigest = computeSourceDigest(validSource);
  const sourceRef = {
    namespace: "bropilot-worlds",
    repoId: "repo-1",
    repoName: "world-1",
    commitSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    contentDigest: sourceDigest,
  };
  const claimedJob = {
    worldId: "world-1",
    runId: "run-1",
    candidateId: "candidate-1",
    leaseId: "lease-1",
    sourceDigest,
    sourceRef,
    contractHash: "contract-1",
    planHash: "plan-1",
    runnerHash,
    source: validSource,
  };
  const packageRef = {
    key: "packages/sha256/package/manifest.json",
    packageDigest: "1".repeat(64),
    buildDigest: "2".repeat(64),
    sourceDigest: claimedJob.sourceDigest,
    sourceRef,
    contractHash: claimedJob.contractHash,
    planHash: claimedJob.planHash,
    runnerHash,
    runId: claimedJob.runId,
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const headers = { "content-type": "application/json" };
    if (String(url).endsWith("/verifier/jobs")) {
      return new Response(JSON.stringify({ jobs: [{ worldId: "world-1", runId: "run-1" }] }), { headers });
    }
    if (String(url).endsWith("/claim")) return new Response(JSON.stringify({ job: claimedJob }), { headers });
    if (String(url).endsWith("/package")) return new Response(JSON.stringify({ packageRef }), { headers });
    return new Response(JSON.stringify({ ok: true }), { headers });
  };
  try {
    await main(["--origin", "https://worlds.example", "--token-file", tokenFile, "--hosted"]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "https://worlds.example/api/v1/verifier/jobs");
  assert.match(calls[2].url, /\/package$/);
  const retained = JSON.parse(calls[2].init.body);
  assert.equal(retained.upload.assets["public/index.html"], validSource.files["public/index.html"]);
  assert.ok(!Object.hasOwn(retained.upload.deployableConfig, "outboundNetwork"));
  const completion = JSON.parse(calls[3].init.body);
  assert.deepEqual(completion.packageRef, packageRef);
  assert.equal(completion.buildDigest, undefined);
  assert.equal(completion.requestId, "complete:run-1:lease-1");
});

test("non-loopback origins require explicit hosted HTTPS mode", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bropilot-verifier-origin-"));
  const tokenFile = path.join(directory, "token");
  await writeFile(tokenFile, "origin-private-token", { mode: 0o600 });

  await assert.rejects(
    main(["--origin", "https://worlds.example", "--token-file", tokenFile]),
    /loopback/i,
  );
  await assert.rejects(
    main(["--origin", "http://worlds.example", "--token-file", tokenFile, "--hosted"]),
    /HTTPS/i,
  );
});
