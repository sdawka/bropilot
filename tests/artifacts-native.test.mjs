import assert from "node:assert/strict";
import { test } from "node:test";

import { CloudflareArtifactsProvider } from "../apps/worker/src/artifacts/native.ts";

function artifactsError(code) {
  return Object.assign(new Error(code), { code });
}

class FakeRepo {
  constructor(binding, info) {
    this.binding = binding;
    this.metadata = info;
  }

  async info() { return this.metadata; }
  async createToken(scope, ttl) {
    this.binding.calls.push(["createToken", this.metadata.name, scope, ttl]);
    return { id: `narrow-${this.metadata.name}`, plaintext: `narrow-secret-${this.metadata.name}`, scope, expiresAt: new Date(Date.now() + ttl * 1_000).toISOString() };
  }
  async revokeToken(value) { this.binding.calls.push(["revokeToken", this.metadata.name, value]); return true; }
  async fork(name, options) {
    this.binding.calls.push(["fork", this.metadata.name, name, options]);
    return this.binding.add(name, `broad-fork?expires=${Math.floor(Date.now() / 1_000) + 86_400}`);
  }
  async log({ ref }) { return this.binding.refs.get(`${this.metadata.name}:${ref}`) ?? []; }
  async readCommit(hash) { return this.binding.commits.get(hash) ?? null; }
  async readTree(hash) { return this.binding.trees.get(hash) ?? null; }
  async readBlob(hash) { return this.binding.blobs.get(hash) ?? null; }
}

class FakeBinding {
  repos = new Map();
  calls = [];
  refs = new Map();
  commits = new Map();
  trees = new Map();
  blobs = new Map();

  add(name, token) {
    const created = { id: `id-${name}`, name, remote: `https://artifacts.test/${name}.git`, token };
    const info = { ...created, description: null, defaultBranch: "main", createdAt: "", updatedAt: "", lastPushAt: null, source: null, readOnly: false };
    this.repos.set(name, new FakeRepo(this, info));
    return created;
  }

  async create(name) {
    this.calls.push(["create", name]);
    return this.add(name, `broad-create?expires=${Math.floor(Date.now() / 1_000) + 86_400}`);
  }

  async get(name) {
    const repo = this.repos.get(name);
    if (!repo) throw artifactsError("NOT_FOUND");
    return repo;
  }
}

test("native provider revokes broad create and fork credentials before returning narrow tokens", async () => {
  const binding = new FakeBinding();
  const provider = new CloudflareArtifactsProvider(binding);
  const created = await provider.createRepository("world-1");
  const forked = await provider.forkRepository(created.repository.repoId, "r-world-1", {
    readOnly: false,
    defaultBranchOnly: true,
    ttlSeconds: 300,
  });

  assert.equal(created.writeToken.value, "narrow-secret-world-1");
  assert.equal(forked.writeToken.value, "narrow-secret-r-world-1");
  assert.deepEqual(binding.calls.filter(([kind]) => kind === "createToken"), [
    ["createToken", "world-1", "write", 300],
    ["createToken", "r-world-1", "write", 300],
  ]);
  assert.ok(binding.calls.some((call) => call[0] === "revokeToken" && call[2].startsWith("broad-create")));
  assert.ok(binding.calls.some((call) => call[0] === "revokeToken" && call[2].startsWith("broad-fork")));
});

test("native provider resolves commit, tree, and blob objects independently", async () => {
  const binding = new FakeBinding();
  binding.add("world-1", `initial?expires=${Math.floor(Date.now() / 1_000) + 300}`);
  const provider = new CloudflareArtifactsProvider(binding);
  const repository = await provider.getRepository("world-1");
  const blobSha = "a".repeat(40);
  const nestedTreeSha = "b".repeat(40);
  const rootTreeSha = "c".repeat(40);
  const commitSha = "d".repeat(40);
  binding.refs.set("world-1:main", [{ hash: commitSha }]);
  binding.commits.set(commitSha, { hash: commitSha, treeHash: rootTreeSha });
  binding.trees.set(rootTreeSha, [{ name: "src", mode: "40000", hash: nestedTreeSha, type: "tree" }]);
  binding.trees.set(nestedTreeSha, [{ name: "worker.ts", mode: "100644", hash: blobSha, type: "blob" }]);
  binding.blobs.set(blobSha, new Blob(["export default {}"]));

  assert.equal(await provider.resolveRef(repository.repoId, "main"), commitSha);
  assert.deepEqual(await provider.readCommit(repository.repoId, commitSha), { commitSha, treeSha: rootTreeSha });
  assert.deepEqual(await provider.readTree(repository.repoId, rootTreeSha), [
    { path: "src/worker.ts", type: "blob", mode: "100644", sha: blobSha },
  ]);
  assert.equal(new TextDecoder().decode(await provider.readBlob(repository.repoId, blobSha)), "export default {}");
});
