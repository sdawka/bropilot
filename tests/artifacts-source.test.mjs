import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ArtifactSourceError,
  computeSourceBundleDigest,
  createWorldRepository,
  persistCandidateSource,
  readPinnedSource,
  reconcileCanonical,
} from "../apps/worker/src/artifacts/source.ts";

const encoder = new TextEncoder();
const NOW_MS = Date.now();

async function digest(value, length = 40) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
}

class FakeArtifactsProvider {
  repos = new Map();
  operations = [];
  sequence = 0;

  async getRepository(repoName) {
    return this.repos.get(repoName)?.metadata ?? null;
  }

  async createRepository(repoName) {
    if (this.repos.has(repoName)) throw new Error("exists");
    const repoId = `repo-${++this.sequence}`;
    const metadata = { repoId, repoName, remote: `https://artifacts.test/${repoName}.git` };
    this.repos.set(repoName, { metadata, refs: new Map(), commits: new Map(), trees: new Map(), blobs: new Map() });
    const token = { id: `token-${this.sequence}`, value: `secret-${this.sequence}`, expiresAtMs: Date.now() + 300_000 };
    this.operations.push({ kind: "create", repoName, token });
    return { repository: metadata, writeToken: token };
  }

  repo(repoId) {
    const repo = [...this.repos.values()].find((item) => item.metadata.repoId === repoId);
    if (!repo) throw new Error(`unknown repo: ${repoId}`);
    return repo;
  }

  async forkRepository(repoId, forkName, options) {
    const source = this.repo(repoId);
    const repoIdFork = `repo-${++this.sequence}`;
    const metadata = { repoId: repoIdFork, repoName: forkName, remote: `https://artifacts.test/${forkName}.git` };
    const fork = {
      metadata,
      refs: new Map(source.refs),
      commits: new Map(source.commits),
      trees: new Map(source.trees),
      blobs: new Map(source.blobs),
    };
    this.repos.set(forkName, fork);
    const token = { id: `token-${this.sequence}`, value: `fork-secret-${this.sequence}`, expiresAtMs: Date.now() + options.ttlSeconds * 1_000 };
    this.operations.push({ kind: "fork", repoId, forkName, options, token });
    return { repository: metadata, writeToken: token };
  }

  async createToken(repoId, access, ttlSeconds) {
    const token = { id: `token-${++this.sequence}`, value: `secret-${this.sequence}`, expiresAtMs: Date.now() + ttlSeconds * 1_000 };
    this.operations.push({ kind: "token", repoId, access, ttlSeconds, token });
    return token;
  }

  async revokeToken(repoId, tokenId) {
    this.operations.push({ kind: "revoke", repoId, tokenId });
  }

  async resolveRef(repoId, ref) {
    return this.repo(repoId).refs.get(ref) ?? null;
  }

  async readCommit(repoId, commitSha) {
    return this.repo(repoId).commits.get(commitSha) ?? null;
  }

  async readTree(repoId, treeSha) {
    return this.repo(repoId).trees.get(treeSha) ?? null;
  }

  async readBlob(repoId, blobSha) {
    return this.repo(repoId).blobs.get(blobSha)?.slice() ?? null;
  }

  async commit(repoId, branch, expectedRefCommitSha, baseCommitSha, files, identity) {
    const repo = this.repo(repoId);
    const current = repo.refs.get(branch) ?? null;
    if (current !== expectedRefCommitSha) throw Object.assign(new Error("non-fast-forward"), { code: "non_fast_forward" });
    const root = [];
    const treeSha = await digest(JSON.stringify(files));
    for (const [path, contents] of Object.entries(files)) {
      const blobSha = await digest(contents);
      repo.blobs.set(blobSha, encoder.encode(contents));
      root.push({ path, type: "blob", mode: "100644", sha: blobSha });
    }
    repo.trees.set(treeSha, root);
    const commitSha = await digest(JSON.stringify({ treeSha, baseCommitSha, identity }));
    repo.commits.set(commitSha, { commitSha, treeSha });
    repo.refs.set(branch, commitSha);
    return { commitSha, treeSha };
  }
}

class FakeGitWriter {
  constructor(provider) {
    this.provider = provider;
    this.calls = [];
  }

  async writeCommit(input) {
    this.calls.push(input);
    return this.provider.commit(
      input.repository.repoId,
      input.branch,
      input.expectedRefCommitSha,
      input.baseCommitSha,
      input.files,
      input.identity,
    );
  }
}

const source = {
  files: {
    "public/index.html": "<!doctype html><title>World</title>",
    "worker.ts": "export default { fetch() { return new Response('ok'); } };",
  },
};

test("browser source digest matches the Rust sorted JSON contract", async () => {
  assert.equal(
    await computeSourceBundleDigest({ files: { "b.txt": "B", "a.txt": "A" } }),
    "bde944504e8633b26fb9f7e2b32d9e7a27e6a4688e03968a95020a00c24aafac",
  );
});

async function setup() {
  const provider = new FakeArtifactsProvider();
  const writer = new FakeGitWriter(provider);
  const repository = await createWorldRepository(provider, writer, {
    namespace: "bropilot-worlds",
    worldId: "world-1",
    title: "World One",
    repoName: "world-world-1",
    requestId: "create-1",
    nowMs: NOW_MS,
  });
  return { provider, writer, repository };
}

test("World repository creation recovers an existing repo left without a main ref", async () => {
  const provider = new FakeArtifactsProvider();
  const writer = new FakeGitWriter(provider);
  await provider.createRepository("world-world-1");
  const repository = await createWorldRepository(provider, writer, {
    namespace: "bropilot-worlds",
    worldId: "world-1",
    title: "World One",
    repoName: "world-world-1",
    requestId: "create-retry",
    nowMs: NOW_MS,
  });

  assert.equal(await provider.resolveRef(repository.repoId, "main"), repository.mainCommitSha);
  assert.ok(provider.operations.some((operation) => operation.kind === "token" && operation.repoId === repository.repoId));
});

test("candidate source is committed through a fork then copied to an immutable canonical ref", async () => {
  const { provider, writer, repository } = await setup();
  const ref = await persistCandidateSource(provider, writer, {
    repository,
    candidateId: "candidate-1",
    requestId: "submit-1",
    expectedBaseCommitSha: repository.mainCommitSha,
    source,
    nowMs: NOW_MS + 1_000,
  });

  assert.equal(ref.repoId, repository.repoId);
  assert.equal(ref.repoName, repository.repoName);
  assert.deepEqual(await readPinnedSource(provider, ref), source);
  assert.equal(writer.calls.length, 3);
  assert.match(writer.calls[1].repository.repoName, /^r-/);
  assert.equal(writer.calls[2].repository.repoName, repository.repoName);
  assert.equal(writer.calls[1].force, false);
  assert.equal(writer.calls[2].force, false);
  const fork = provider.operations.find((operation) => operation.kind === "fork");
  assert.equal(fork.options.defaultBranchOnly, true);
  assert.ok(fork.options.ttlSeconds <= 300);
  assert.ok(provider.operations.filter((operation) => operation.kind === "revoke").length >= 2);

  const pinned = structuredClone(await readPinnedSource(provider, ref));
  provider.repo(repository.repoId).refs.set("main", "0".repeat(40));
  assert.deepEqual(await readPinnedSource(provider, ref), pinned, "moving refs must not change pinned input");
});

test("same submission is idempotent while a request collision with different input is rejected", async () => {
  const { provider, writer, repository } = await setup();
  const input = {
    repository,
    candidateId: "candidate-1",
    requestId: "submit-1",
    expectedBaseCommitSha: repository.mainCommitSha,
    source,
    nowMs: NOW_MS + 1_000,
  };
  const first = await persistCandidateSource(provider, writer, input);
  const callCount = writer.calls.length;
  assert.deepEqual(await persistCandidateSource(provider, writer, input), first);
  assert.equal(writer.calls.length, callCount);
  await assert.rejects(
    persistCandidateSource(provider, writer, {
      ...input,
      source: { files: { ...source.files, "worker.ts": `${source.files["worker.ts"]}\n// changed` } },
    }),
    (error) => error instanceof ArtifactSourceError && error.code === "request_collision",
  );
});

test("pinned reads reject commit, path, symlink, and bounded-tree violations", async () => {
  const { provider, writer, repository } = await setup();
  const ref = await persistCandidateSource(provider, writer, {
    repository,
    candidateId: "candidate-1",
    requestId: "submit-1",
    expectedBaseCommitSha: repository.mainCommitSha,
    source,
    nowMs: NOW_MS + 1_000,
  });
  await assert.rejects(
    readPinnedSource(provider, { ...ref, treeSha: "0".repeat(40) }),
    (error) => error instanceof ArtifactSourceError && error.code === "tree_mismatch",
  );
  const repo = provider.repo(ref.repoId);
  const original = repo.trees.get(ref.treeSha);
  repo.trees.set(ref.treeSha, [{ path: "../escape.ts", type: "blob", mode: "100644", sha: original[0].sha }]);
  await assert.rejects(readPinnedSource(provider, ref), /source path/i);
  repo.trees.set(ref.treeSha, [{ path: "link", type: "blob", mode: "120000", sha: original[0].sha }]);
  await assert.rejects(readPinnedSource(provider, ref), /symlink/i);
  repo.trees.set(ref.treeSha, Array.from({ length: 65 }, (_, index) => ({
    path: `file-${index}.ts`, type: "blob", mode: "100644", sha: original[0].sha,
  })));
  await assert.rejects(
    readPinnedSource(provider, ref),
    (error) => error instanceof ArtifactSourceError && error.code === "source_limit",
  );
});

test("baseline conflicts reject without force and post-promotion reconciliation advances main explicitly", async () => {
  const { provider, writer, repository } = await setup();
  await assert.rejects(
    persistCandidateSource(provider, writer, {
      repository,
      candidateId: "candidate-1",
      requestId: "submit-1",
      expectedBaseCommitSha: "0".repeat(40),
      source,
      nowMs: NOW_MS + 1_000,
    }),
    (error) => error instanceof ArtifactSourceError && error.code === "baseline_conflict",
  );
  const ref = await persistCandidateSource(provider, writer, {
    repository,
    candidateId: "candidate-1",
    requestId: "submit-2",
    expectedBaseCommitSha: repository.mainCommitSha,
    source,
    nowMs: NOW_MS + 1_000,
  });
  const result = await reconcileCanonical(provider, writer, {
    repository,
    sourceRef: ref,
    expectedMainCommitSha: repository.mainCommitSha,
    requestId: "promote-1",
    nowMs: NOW_MS + 2_000,
  });
  assert.equal(await provider.resolveRef(repository.repoId, "main"), result.mainCommitSha);
  assert.equal(writer.calls.at(-1).force, false);
});
