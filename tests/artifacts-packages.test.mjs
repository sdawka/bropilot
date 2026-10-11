import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ArtifactPackageError,
  loadVerifiedPackage,
  retainBuildPackage,
} from "../apps/worker/src/artifacts/packages.ts";

class MemoryObject {
  constructor(bytes) {
    this.bytes = bytes;
  }

  async arrayBuffer() {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    );
  }
}

class MemoryBucket {
  objects = new Map();

  async get(key) {
    const bytes = this.objects.get(key);
    return bytes ? new MemoryObject(bytes) : null;
  }

  async put(key, value, options = {}) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    this.objects.set(key, bytes.slice());
    return { key };
  }
}

const sourceRef = Object.freeze({
  namespace: "bropilot-worlds",
  repoId: "repo-1",
  repoName: "world-1",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  contentDigest: "c".repeat(64),
});

const job = Object.freeze({
  worldId: "world-1",
  candidateId: "candidate-1",
  runId: "run-1",
  leaseId: "lease-1",
  sourceDigest: sourceRef.contentDigest,
  sourceRef,
  contractHash: "e".repeat(64),
  planHash: "f".repeat(64),
  runnerHash: "1".repeat(64),
});

const upload = Object.freeze({
  compiledWorker: "export default { fetch() { return new Response('ok'); } };\n",
  assets: { "public/index.html": "<!doctype html><title>World</title>" },
  deployableConfig: {
    compatibilityDate: "2026-10-08",
    compatibilityFlags: [],
    entrypoint: "worker.ts",
    assetsBinding: "ASSETS",
    nodejsCompat: false,
  },
  buildDigest: "300f77ae0c16422ead805d1b2c32412753b1fde123d9b6ce951978679823417c",
  toolchain: {
    esbuildVersion: "0.28.2",
    miniflareVersion: "5.20261006.0-alpha",
    workerdVersion: "1.20260928.0",
  },
});

test("retained packages are deterministic and load only after every byte is rehashed", async () => {
  const bucket = new MemoryBucket();
  const first = await retainBuildPackage(bucket, upload, job);
  const second = await retainBuildPackage(bucket, upload, job);

  assert.deepEqual(second, first);
  assert.match(first.key, /^packages\/sha256\/[a-f0-9]{64}\/manifest\.json$/);
  assert.equal(first.sourceRef, sourceRef);
  const loaded = await loadVerifiedPackage(bucket, first);
  assert.equal(new TextDecoder().decode(loaded.compiledWorker), upload.compiledWorker);
  assert.equal(
    new TextDecoder().decode(loaded.assets["public/index.html"]),
    upload.assets["public/index.html"],
  );
  assert.equal(loaded.manifest.packageDigest, first.packageDigest);
});

test("retention rejects a build digest that does not bind the exact output, assets, and deploy config", async () => {
  const bucket = new MemoryBucket();
  await assert.rejects(
    retainBuildPackage(bucket, { ...upload, compiledWorker: `${upload.compiledWorker}// changed` }, job),
    (error) => error instanceof ArtifactPackageError && error.code === "build_digest_mismatch",
  );
  assert.equal(bucket.objects.size, 0);
});

test("retention rejects a source digest that is detached from the canonical source reference", async () => {
  await assert.rejects(
    retainBuildPackage(new MemoryBucket(), upload, { ...job, sourceDigest: "d".repeat(64) }),
    (error) => error instanceof ArtifactPackageError && error.code === "source_binding_mismatch",
  );
});

test("duplicate immutable keys with different bytes are rejected", async () => {
  const bucket = new MemoryBucket();
  const ref = await retainBuildPackage(bucket, upload, job);
  const moduleKey = `packages/sha256/${ref.packageDigest}/worker.mjs`;
  bucket.objects.set(moduleKey, new TextEncoder().encode("tampered"));

  await assert.rejects(
    retainBuildPackage(bucket, upload, job),
    (error) => error instanceof ArtifactPackageError && error.code === "immutable_object_conflict",
  );
});

test("retained package loading rejects tampered bytes and mismatched protected references", async () => {
  const bucket = new MemoryBucket();
  const ref = await retainBuildPackage(bucket, upload, job);
  const assetKey = `packages/sha256/${ref.packageDigest}/assets/public/index.html`;
  bucket.objects.set(assetKey, new TextEncoder().encode("tampered"));

  await assert.rejects(
    loadVerifiedPackage(bucket, ref),
    (error) => error instanceof ArtifactPackageError && error.code === "package_byte_mismatch",
  );
  await assert.rejects(
    loadVerifiedPackage(bucket, { ...ref, sourceDigest: "0".repeat(64) }),
    (error) => error instanceof ArtifactPackageError && error.code === "package_ref_mismatch",
  );
});
