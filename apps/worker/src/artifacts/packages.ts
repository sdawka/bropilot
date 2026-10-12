export type ArtifactSourceRef = {
  namespace: string;
  repoId: string;
  repoName: string;
  commitSha: string;
  treeSha: string;
  contentDigest: string;
};

export type RetainedPackageRef = {
  key: string;
  packageDigest: string;
  buildDigest: string;
  sourceDigest: string;
  sourceRef: ArtifactSourceRef;
  contractHash: string;
  planHash: string;
  runnerHash: string;
  runId: string;
};

export type BuildPackageUpload = {
  compiledWorker: string;
  assets: Record<string, string>;
  deployableConfig: Record<string, unknown>;
  buildDigest: string;
  toolchain: Record<string, string>;
};

export type PackageJobBinding = {
  worldId: string;
  candidateId: string;
  runId: string;
  leaseId: string;
  sourceDigest: string;
  sourceRef: ArtifactSourceRef;
  contractHash: string;
  planHash: string;
  runnerHash: string;
};

type ByteDescriptor = {
  path: string;
  sha256: string;
  bytes: number;
};

export type BuildPackageManifest = {
  packageVersion: 1;
  packageDigest: string;
  module: ByteDescriptor;
  assets: ByteDescriptor[];
  deployableConfig: Record<string, unknown>;
  deployableConfigHash: string;
  sourceDigest: string;
  sourceRef: ArtifactSourceRef;
  contractHash: string;
  planHash: string;
  runnerHash: string;
  toolchain: Record<string, string>;
  buildDigest: string;
  worldId: string;
  candidateId: string;
  runId: string;
  leaseId: string;
};

export type DeployablePackage = {
  manifest: BuildPackageManifest;
  compiledWorker: Uint8Array;
  assets: Record<string, Uint8Array>;
};

type ArtifactObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ArtifactBucket = {
  get(key: string): Promise<ArtifactObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: { onlyIf?: { etagDoesNotMatch?: string } },
  ): Promise<unknown | null>;
};

export class ArtifactPackageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArtifactPackageError";
    this.code = code;
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const HEX_64 = /^[a-f0-9]{64}$/;
const MAX_COMPILED_BYTES = 512 * 1024;
const MAX_ASSETS = 64;
const MAX_ASSET_BYTES = 64 * 1024;
const MAX_CONFIG_BYTES = 16 * 1024;

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function readObject(bucket: ArtifactBucket, key: string): Promise<Uint8Array | null> {
  const object = await bucket.get(key);
  return object ? new Uint8Array(await object.arrayBuffer()) : null;
}

async function immutablePut(bucket: ArtifactBucket, key: string, bytes: Uint8Array): Promise<void> {
  const existing = await readObject(bucket, key);
  if (existing) {
    if (!bytesEqual(existing, bytes)) {
      throw new ArtifactPackageError("immutable_object_conflict", `immutable package object differs: ${key}`);
    }
    return;
  }
  const result = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" } });
  const stored = await readObject(bucket, key);
  if (result === null && !stored) {
    throw new ArtifactPackageError("package_upload_failed", `package object was not retained: ${key}`);
  }
  if (!stored || !bytesEqual(stored, bytes)) {
    throw new ArtifactPackageError(
      result === null ? "immutable_object_conflict" : "package_upload_failed",
      `retained package object did not match its receipt: ${key}`,
    );
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new ArtifactPackageError("invalid_package", `${field} must be a bounded non-empty string`);
  }
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !HEX_64.test(value)) {
    throw new ArtifactPackageError("invalid_package", `${field} must be a lowercase SHA-256 digest`);
  }
}

function validateSourceRef(ref: ArtifactSourceRef): void {
  if (!ref || typeof ref !== "object") throw new ArtifactPackageError("invalid_package", "sourceRef is required");
  for (const field of ["namespace", "repoId", "repoName"] as const) assertString(ref[field], `sourceRef.${field}`);
  if (!/^[a-f0-9]{40,64}$/.test(ref.commitSha)) {
    throw new ArtifactPackageError("invalid_package", "sourceRef.commitSha must be a Git object id");
  }
  if (!/^[a-f0-9]{40,64}$/.test(ref.treeSha)) {
    throw new ArtifactPackageError("invalid_package", "sourceRef.treeSha must be a Git object id");
  }
  assertDigest(ref.contentDigest, "sourceRef.contentDigest");
}

function validateAssetPath(assetPath: string): void {
  if (
    !assetPath.startsWith("public/")
    || assetPath.length > 256
    || !/^[\x20-\x7e]+$/.test(assetPath)
    || assetPath.includes("\\")
    || assetPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new ArtifactPackageError("invalid_package", `invalid deployable asset path: ${assetPath}`);
  }
}

function validateBinding(job: PackageJobBinding): void {
  for (const field of ["worldId", "candidateId", "runId", "leaseId"] as const) assertString(job[field], field);
  for (const field of ["sourceDigest", "contractHash", "planHash", "runnerHash"] as const) {
    assertDigest(job[field], field);
  }
  validateSourceRef(job.sourceRef);
  if (job.sourceDigest !== job.sourceRef.contentDigest) {
    throw new ArtifactPackageError("source_binding_mismatch", "sourceDigest does not match the canonical source reference");
  }
}

function manifestCore(manifest: BuildPackageManifest): Omit<BuildPackageManifest, "packageDigest"> {
  const { packageDigest: _packageDigest, ...core } = manifest;
  return core;
}

function sourceRefEqual(left: ArtifactSourceRef, right: ArtifactSourceRef): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function retainBuildPackage(
  bucket: ArtifactBucket,
  upload: BuildPackageUpload,
  job: PackageJobBinding,
): Promise<RetainedPackageRef> {
  validateBinding(job);
  if (!upload || typeof upload !== "object" || typeof upload.compiledWorker !== "string") {
    throw new ArtifactPackageError("invalid_package", "compiledWorker must be UTF-8 text");
  }
  if (!upload.assets || typeof upload.assets !== "object" || Array.isArray(upload.assets)) {
    throw new ArtifactPackageError("invalid_package", "assets must be a record of UTF-8 text files");
  }
  const compiledWorker = textEncoder.encode(upload.compiledWorker);
  if (compiledWorker.byteLength === 0 || compiledWorker.byteLength > MAX_COMPILED_BYTES) {
    throw new ArtifactPackageError("package_limit", "compiled Worker exceeds the retained package limit");
  }
  const sortedAssets = sortedRecord(upload.assets);
  const assetEntries = Object.entries(sortedAssets);
  if (assetEntries.length > MAX_ASSETS) throw new ArtifactPackageError("package_limit", "too many retained assets");
  let assetBytes = 0;
  for (const [assetPath, contents] of assetEntries) {
    validateAssetPath(assetPath);
    if (typeof contents !== "string") throw new ArtifactPackageError("invalid_package", "asset values must be UTF-8 text");
    assetBytes += textEncoder.encode(contents).byteLength;
  }
  if (assetBytes > MAX_ASSET_BYTES) throw new ArtifactPackageError("package_limit", "retained assets exceed the byte limit");
  if (!upload.deployableConfig || typeof upload.deployableConfig !== "object" || Array.isArray(upload.deployableConfig)) {
    throw new ArtifactPackageError("invalid_package", "deployableConfig must be an object");
  }
  const configJson = JSON.stringify(upload.deployableConfig);
  if (textEncoder.encode(configJson).byteLength > MAX_CONFIG_BYTES) {
    throw new ArtifactPackageError("package_limit", "deployable config exceeds the byte limit");
  }
  assertDigest(upload.buildDigest, "buildDigest");
  const expectedBuildDigest = await sha256(JSON.stringify({
    compiledOutput: upload.compiledWorker,
    assets: sortedAssets,
    runtimeConfig: upload.deployableConfig,
  }));
  if (expectedBuildDigest !== upload.buildDigest) {
    throw new ArtifactPackageError("build_digest_mismatch", "buildDigest does not bind the uploaded package bytes");
  }
  if (!upload.toolchain || typeof upload.toolchain !== "object" || Array.isArray(upload.toolchain)) {
    throw new ArtifactPackageError("invalid_package", "toolchain must be a string record");
  }
  for (const [name, version] of Object.entries(upload.toolchain)) {
    assertString(name, "toolchain key");
    assertString(version, `toolchain.${name}`);
  }

  const moduleDescriptor: ByteDescriptor = {
    path: "worker.mjs",
    sha256: await sha256(compiledWorker),
    bytes: compiledWorker.byteLength,
  };
  const assetDescriptors: ByteDescriptor[] = await Promise.all(assetEntries.map(async ([assetPath, contents]) => {
    const bytes = textEncoder.encode(contents);
    return { path: assetPath, sha256: await sha256(bytes), bytes: bytes.byteLength };
  }));
  const core: Omit<BuildPackageManifest, "packageDigest"> = {
    packageVersion: 1,
    module: moduleDescriptor,
    assets: assetDescriptors,
    deployableConfig: upload.deployableConfig,
    deployableConfigHash: await sha256(configJson),
    sourceDigest: job.sourceDigest,
    sourceRef: job.sourceRef,
    contractHash: job.contractHash,
    planHash: job.planHash,
    runnerHash: job.runnerHash,
    toolchain: sortedRecord(upload.toolchain),
    buildDigest: upload.buildDigest,
    worldId: job.worldId,
    candidateId: job.candidateId,
    runId: job.runId,
    leaseId: job.leaseId,
  };
  const packageDigest = await sha256(JSON.stringify(core));
  const manifest: BuildPackageManifest = { ...core, packageDigest };
  const prefix = `packages/sha256/${packageDigest}`;

  await immutablePut(bucket, `${prefix}/${moduleDescriptor.path}`, compiledWorker);
  for (const [assetPath, contents] of assetEntries) {
    await immutablePut(bucket, `${prefix}/assets/${assetPath}`, textEncoder.encode(contents));
  }
  const key = `${prefix}/manifest.json`;
  await immutablePut(bucket, key, textEncoder.encode(JSON.stringify(manifest)));

  return {
    key,
    packageDigest,
    buildDigest: upload.buildDigest,
    sourceDigest: job.sourceDigest,
    sourceRef: job.sourceRef,
    contractHash: job.contractHash,
    planHash: job.planHash,
    runnerHash: job.runnerHash,
    runId: job.runId,
  };
}

function assertRefMatchesManifest(ref: RetainedPackageRef, manifest: BuildPackageManifest): void {
  const expectedKey = `packages/sha256/${manifest.packageDigest}/manifest.json`;
  if (
    ref.key !== expectedKey
    || ref.packageDigest !== manifest.packageDigest
    || ref.buildDigest !== manifest.buildDigest
    || ref.sourceDigest !== manifest.sourceDigest
    || !sourceRefEqual(ref.sourceRef, manifest.sourceRef)
    || ref.contractHash !== manifest.contractHash
    || ref.planHash !== manifest.planHash
    || ref.runnerHash !== manifest.runnerHash
    || ref.runId !== manifest.runId
  ) {
    throw new ArtifactPackageError("package_ref_mismatch", "retained package reference does not match its manifest");
  }
}

export async function loadVerifiedPackage(
  bucket: ArtifactBucket,
  ref: RetainedPackageRef,
): Promise<DeployablePackage> {
  assertDigest(ref.packageDigest, "packageDigest");
  assertDigest(ref.buildDigest, "buildDigest");
  assertDigest(ref.sourceDigest, "sourceDigest");
  assertDigest(ref.contractHash, "contractHash");
  assertDigest(ref.planHash, "planHash");
  assertDigest(ref.runnerHash, "runnerHash");
  assertString(ref.runId, "runId");
  validateSourceRef(ref.sourceRef);
  if (ref.key !== `packages/sha256/${ref.packageDigest}/manifest.json`) {
    throw new ArtifactPackageError("package_ref_mismatch", "retained package key does not match its digest");
  }
  const manifestBytes = await readObject(bucket, ref.key);
  if (!manifestBytes) throw new ArtifactPackageError("package_missing", "retained package manifest is missing");
  let manifest: BuildPackageManifest;
  try {
    manifest = JSON.parse(textDecoder.decode(manifestBytes)) as BuildPackageManifest;
  } catch {
    throw new ArtifactPackageError("package_manifest_invalid", "retained package manifest is not canonical JSON");
  }
  if (JSON.stringify(manifest) !== textDecoder.decode(manifestBytes) || manifest.packageVersion !== 1) {
    throw new ArtifactPackageError("package_manifest_invalid", "retained package manifest is not canonical version 1 JSON");
  }
  if (manifest.sourceDigest !== manifest.sourceRef?.contentDigest) {
    throw new ArtifactPackageError("source_binding_mismatch", "retained manifest source binding does not match");
  }
  const packageDigest = await sha256(JSON.stringify(manifestCore(manifest)));
  if (packageDigest !== manifest.packageDigest) {
    throw new ArtifactPackageError("package_byte_mismatch", "retained package manifest digest does not match");
  }
  assertRefMatchesManifest(ref, manifest);
  const prefix = `packages/sha256/${manifest.packageDigest}`;
  const compiledWorker = await readObject(bucket, `${prefix}/${manifest.module.path}`);
  if (
    !compiledWorker
    || compiledWorker.byteLength !== manifest.module.bytes
    || await sha256(compiledWorker) !== manifest.module.sha256
  ) {
    throw new ArtifactPackageError("package_byte_mismatch", "retained Worker module digest does not match");
  }
  const assets: Record<string, Uint8Array> = {};
  for (const descriptor of manifest.assets) {
    validateAssetPath(descriptor.path);
    const bytes = await readObject(bucket, `${prefix}/assets/${descriptor.path}`);
    if (!bytes || bytes.byteLength !== descriptor.bytes || await sha256(bytes) !== descriptor.sha256) {
      throw new ArtifactPackageError("package_byte_mismatch", `retained asset digest does not match: ${descriptor.path}`);
    }
    assets[descriptor.path] = bytes;
  }
  if (await sha256(JSON.stringify(manifest.deployableConfig)) !== manifest.deployableConfigHash) {
    throw new ArtifactPackageError("package_byte_mismatch", "deployable config digest does not match");
  }
  return { manifest, compiledWorker, assets };
}
