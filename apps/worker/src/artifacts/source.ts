import type { ArtifactSourceRef } from "./packages";

export type SourceBundle = { files: Record<string, string> };

export type ArtifactRepository = {
  repoId: string;
  repoName: string;
  remote: string;
};

export type WorldRepository = ArtifactRepository & {
  namespace: string;
  worldId: string;
  mainCommitSha: string;
};

export type ArtifactToken = {
  id: string;
  value: string;
  expiresAtMs: number;
};

export type ArtifactTreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  mode: string;
  sha: string;
};

export interface ArtifactRepositoryProvider {
  getRepository(repoName: string): Promise<ArtifactRepository | null>;
  createRepository(repoName: string): Promise<{ repository: ArtifactRepository; writeToken: ArtifactToken }>;
  forkRepository(
    repoId: string,
    forkName: string,
    options: { defaultBranchOnly: true; readOnly: false; ttlSeconds: number },
  ): Promise<{ repository: ArtifactRepository; writeToken: ArtifactToken }>;
  createToken(repoId: string, access: "write", ttlSeconds: number): Promise<ArtifactToken>;
  revokeToken(repoId: string, tokenId: string): Promise<void>;
  resolveRef(repoId: string, ref: string): Promise<string | null>;
  readCommit(repoId: string, commitSha: string): Promise<{ commitSha: string; treeSha: string } | null>;
  /** Returns flattened leaf entries rooted at treeSha. Implementations must bound traversal. */
  readTree(repoId: string, treeSha: string): Promise<ArtifactTreeEntry[] | null>;
  readBlob(repoId: string, blobSha: string): Promise<Uint8Array | null>;
}

export type GitCommitIdentity = {
  message: string;
  author: { name: string; email: string; timestamp: number; timezoneOffset: number };
};

export interface ArtifactGitWriter {
  writeCommit(input: {
    repository: ArtifactRepository;
    token: string;
    branch: string;
    expectedRefCommitSha: string | null;
    baseCommitSha: string | null;
    files: Record<string, string>;
    identity: GitCommitIdentity;
    force: false;
  }): Promise<{ commitSha: string; treeSha: string }>;
}

export class ArtifactSourceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArtifactSourceError";
    this.code = code;
  }
}

const MAX_FILES = 64;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TREE_ENTRIES = 128;
const TOKEN_TTL_SECONDS = 300;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

function sortedRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validatePath(filePath: string): void {
  if (
    filePath.length === 0
    || filePath.length > 256
    || !/^[\x20-\x7e]+$/.test(filePath)
    || filePath.includes("\\")
    || filePath.startsWith("/")
    || filePath.split("/")[0].includes(":")
    || filePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new ArtifactSourceError("invalid_source_path", `invalid source path: ${filePath}`);
  }
}

export function validateSourceBundle(source: SourceBundle): Record<string, string> {
  if (!source || typeof source !== "object" || !source.files || typeof source.files !== "object" || Array.isArray(source.files)) {
    throw new ArtifactSourceError("invalid_source", "source.files must be a record of UTF-8 text files");
  }
  const entries = Object.entries(source.files);
  if (entries.length === 0 || entries.length > MAX_FILES) {
    throw new ArtifactSourceError("source_limit", `source must contain 1 to ${MAX_FILES} files`);
  }
  let totalBytes = 0;
  for (const [filePath, contents] of entries) {
    validatePath(filePath);
    if (typeof contents !== "string") {
      throw new ArtifactSourceError("invalid_source", `source file must be UTF-8 text: ${filePath}`);
    }
    totalBytes += textEncoder.encode(filePath).byteLength + textEncoder.encode(contents).byteLength;
  }
  if (totalBytes > MAX_SOURCE_BYTES) {
    throw new ArtifactSourceError("source_limit", `source exceeds ${MAX_SOURCE_BYTES} UTF-8 bytes`);
  }
  return sortedRecord(source.files);
}

export async function computeSourceBundleDigest(source: SourceBundle): Promise<string> {
  return sha256(JSON.stringify({ files: validateSourceBundle(source) }));
}

function commitIdentity(message: string, nowMs: number): GitCommitIdentity {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new ArtifactSourceError("invalid_request", "nowMs must be a non-negative integer");
  }
  return {
    message,
    author: {
      name: "Bropilot World Authority",
      email: "world-authority@bropilot.invalid",
      timestamp: Math.floor(nowMs / 1_000),
      timezoneOffset: 0,
    },
  };
}

function assertRepository(repository: ArtifactRepository): void {
  for (const value of [repository.repoId, repository.repoName, repository.remote]) {
    if (typeof value !== "string" || value.length === 0) {
      throw new ArtifactSourceError("repository_invalid", "Artifacts returned incomplete repository metadata");
    }
  }
}

function assertToken(token: ArtifactToken, nowMs: number): void {
  if (
    !token
    || typeof token.id !== "string"
    || typeof token.value !== "string"
    || token.id.length === 0
    || token.value.length === 0
    || !Number.isFinite(token.expiresAtMs)
    || token.expiresAtMs <= nowMs
    || token.expiresAtMs > nowMs + (TOKEN_TTL_SECONDS + 30) * 1_000
  ) {
    throw new ArtifactSourceError("token_scope_invalid", "Artifacts write token is missing or exceeds the narrow lifetime");
  }
}

async function revokeQuietly(provider: ArtifactRepositoryProvider, repoId: string, tokenId: string): Promise<void> {
  await provider.revokeToken(repoId, tokenId).catch(() => {});
}

async function sourceFromCommit(
  provider: ArtifactRepositoryProvider,
  repository: Pick<ArtifactRepository, "repoId">,
  commitSha: string,
  expectedTreeSha?: string,
): Promise<{ source: SourceBundle; treeSha: string; contentDigest: string }> {
  if (!/^[a-f0-9]{40,64}$/.test(commitSha)) {
    throw new ArtifactSourceError("commit_invalid", "commit SHA must be a Git object id");
  }
  const commit = await provider.readCommit(repository.repoId, commitSha);
  if (!commit || commit.commitSha !== commitSha) {
    throw new ArtifactSourceError("commit_missing", "pinned source commit is missing");
  }
  if (expectedTreeSha !== undefined && commit.treeSha !== expectedTreeSha) {
    throw new ArtifactSourceError("tree_mismatch", "pinned commit does not resolve to the recorded tree");
  }
  const entries = await provider.readTree(repository.repoId, commit.treeSha);
  if (!entries) throw new ArtifactSourceError("tree_missing", "pinned source tree is missing");
  if (entries.length === 0 || entries.length > MAX_TREE_ENTRIES) {
    throw new ArtifactSourceError("source_limit", "pinned source tree exceeds the entry limit");
  }
  const files: Record<string, string> = {};
  for (const entry of entries) {
    validatePath(entry.path);
    if (entry.mode === "120000") {
      throw new ArtifactSourceError("symlink_rejected", `source symlink is not allowed: ${entry.path}`);
    }
    if (entry.type !== "blob" || entry.mode !== "100644") {
      throw new ArtifactSourceError("tree_entry_rejected", `unsupported source tree entry: ${entry.path}`);
    }
    if (Object.hasOwn(files, entry.path)) {
      throw new ArtifactSourceError("tree_entry_rejected", `duplicate source tree path: ${entry.path}`);
    }
    const blob = await provider.readBlob(repository.repoId, entry.sha);
    if (!blob) throw new ArtifactSourceError("blob_missing", `source blob is missing: ${entry.path}`);
    try {
      files[entry.path] = textDecoder.decode(blob);
    } catch {
      throw new ArtifactSourceError("binary_source_rejected", `source file is not UTF-8 text: ${entry.path}`);
    }
  }
  const source = { files: validateSourceBundle({ files }) };
  return { source, treeSha: commit.treeSha, contentDigest: await computeSourceBundleDigest(source) };
}

export async function readPinnedSource(
  provider: ArtifactRepositoryProvider,
  sourceRef: ArtifactSourceRef,
): Promise<SourceBundle> {
  const repository = await provider.getRepository(sourceRef.repoName);
  if (!repository || repository.repoId !== sourceRef.repoId) {
    throw new ArtifactSourceError("repository_mismatch", "pinned source repository identity does not match");
  }
  const pinned = await sourceFromCommit(provider, repository, sourceRef.commitSha, sourceRef.treeSha);
  if (pinned.contentDigest !== sourceRef.contentDigest) {
    throw new ArtifactSourceError("content_digest_mismatch", "pinned source bytes do not match the recorded digest");
  }
  return pinned.source;
}

export async function createWorldRepository(
  provider: ArtifactRepositoryProvider,
  writer: ArtifactGitWriter,
  input: {
    namespace: string;
    worldId: string;
    title: string;
    repoName: string;
    requestId: string;
    nowMs: number;
  },
): Promise<WorldRepository> {
  for (const [field, value] of Object.entries(input)) {
    if (field !== "nowMs" && (typeof value !== "string" || value.length === 0)) {
      throw new ArtifactSourceError("invalid_request", `${field} must be a non-empty string`);
    }
  }
  const existing = await provider.getRepository(input.repoName);
  if (existing) {
    assertRepository(existing);
    const mainCommitSha = await provider.resolveRef(existing.repoId, "main");
    if (mainCommitSha) {
      return { ...existing, namespace: input.namespace, worldId: input.worldId, mainCommitSha };
    }
  }
  let repository: ArtifactRepository;
  let writeToken: ArtifactToken;
  if (existing) {
    repository = existing;
    writeToken = await provider.createToken(repository.repoId, "write", TOKEN_TTL_SECONDS);
  } else {
    const created = await provider.createRepository(input.repoName);
    repository = created.repository;
    writeToken = created.writeToken;
  }
  assertRepository(repository);
  assertToken(writeToken, input.nowMs);
  const bootstrap = validateSourceBundle({
    files: {
      ".bropilot/world.json": `${JSON.stringify({ worldId: input.worldId, title: input.title })}\n`,
    },
  });
  try {
    const committed = await writer.writeCommit({
      repository,
      token: writeToken.value,
      branch: "main",
      expectedRefCommitSha: null,
      baseCommitSha: null,
      files: bootstrap,
      identity: commitIdentity(`Create World ${input.worldId}`, input.nowMs),
      force: false,
    });
    const observed = await sourceFromCommit(provider, repository, committed.commitSha, committed.treeSha);
    if (observed.contentDigest !== await computeSourceBundleDigest({ files: bootstrap })) {
      throw new ArtifactSourceError("source_copy_mismatch", "World repository bootstrap did not preserve exact bytes");
    }
    return {
      ...repository,
      namespace: input.namespace,
      worldId: input.worldId,
      mainCommitSha: committed.commitSha,
    };
  } finally {
    await revokeQuietly(provider, repository.repoId, writeToken.id);
  }
}

export async function persistCandidateSource(
  provider: ArtifactRepositoryProvider,
  writer: ArtifactGitWriter,
  input: {
    repository: WorldRepository;
    candidateId: string;
    requestId: string;
    expectedBaseCommitSha: string;
    source: SourceBundle;
    nowMs: number;
  },
): Promise<ArtifactSourceRef> {
  const canonical = await provider.getRepository(input.repository.repoName);
  if (!canonical || canonical.repoId !== input.repository.repoId) {
    throw new ArtifactSourceError("repository_mismatch", "World canonical repository identity does not match");
  }
  const files = validateSourceBundle(input.source);
  const contentDigest = await computeSourceBundleDigest({ files });
  const requestDigest = await sha256(`${input.repository.worldId}\0${input.candidateId}\0${input.requestId}`);
  const candidateBranch = `candidates/${requestDigest.slice(0, 32)}`;
  const existingCommitSha = await provider.resolveRef(input.repository.repoId, candidateBranch);
  if (existingCommitSha) {
    const existing = await sourceFromCommit(provider, input.repository, existingCommitSha);
    if (existing.contentDigest !== contentDigest) {
      throw new ArtifactSourceError("request_collision", "submission request already names different source bytes");
    }
    return {
      namespace: input.repository.namespace,
      repoId: input.repository.repoId,
      repoName: input.repository.repoName,
      commitSha: existingCommitSha,
      treeSha: existing.treeSha,
      contentDigest,
    };
  }
  const currentMain = await provider.resolveRef(input.repository.repoId, "main");
  if (currentMain !== input.expectedBaseCommitSha) {
    throw new ArtifactSourceError("baseline_conflict", "canonical World baseline changed before submission");
  }
  await sourceFromCommit(provider, input.repository, input.expectedBaseCommitSha);
  const forkName = `r-${input.repository.repoName.slice(0, 20)}-${requestDigest.slice(0, 16)}`;
  const forked = await provider.forkRepository(input.repository.repoId, forkName, {
    defaultBranchOnly: true,
    readOnly: false,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  assertRepository(forked.repository);
  assertToken(forked.writeToken, input.nowMs);
  let canonicalToken: ArtifactToken | undefined;
  try {
    const identity = commitIdentity(`Candidate ${input.candidateId}`, input.nowMs);
    const forkCommit = await writer.writeCommit({
      repository: forked.repository,
      token: forked.writeToken.value,
      branch: "main",
      expectedRefCommitSha: input.expectedBaseCommitSha,
      baseCommitSha: input.expectedBaseCommitSha,
      files,
      identity,
      force: false,
    });
    const forkSource = await sourceFromCommit(provider, forked.repository, forkCommit.commitSha, forkCommit.treeSha);
    if (forkSource.contentDigest !== contentDigest) {
      throw new ArtifactSourceError("source_copy_mismatch", "isolated fork commit did not preserve exact source bytes");
    }

    canonicalToken = await provider.createToken(input.repository.repoId, "write", TOKEN_TTL_SECONDS);
    assertToken(canonicalToken, input.nowMs);
    const canonicalCommit = await writer.writeCommit({
      repository: input.repository,
      token: canonicalToken.value,
      branch: candidateBranch,
      expectedRefCommitSha: null,
      baseCommitSha: input.expectedBaseCommitSha,
      files,
      identity,
      force: false,
    });
    if (canonicalCommit.commitSha !== forkCommit.commitSha || canonicalCommit.treeSha !== forkCommit.treeSha) {
      throw new ArtifactSourceError("source_copy_mismatch", "canonical candidate copy changed Git object identity");
    }
    const sourceRef: ArtifactSourceRef = {
      namespace: input.repository.namespace,
      repoId: input.repository.repoId,
      repoName: input.repository.repoName,
      commitSha: canonicalCommit.commitSha,
      treeSha: canonicalCommit.treeSha,
      contentDigest,
    };
    await readPinnedSource(provider, sourceRef);
    return sourceRef;
  } catch (error) {
    if ((error as { code?: string })?.code === "non_fast_forward") {
      throw new ArtifactSourceError("baseline_conflict", "Git ref changed; non-force candidate push was rejected");
    }
    throw error;
  } finally {
    await revokeQuietly(provider, forked.repository.repoId, forked.writeToken.id);
    if (canonicalToken) await revokeQuietly(provider, input.repository.repoId, canonicalToken.id);
  }
}

export async function reconcileCanonical(
  provider: ArtifactRepositoryProvider,
  writer: ArtifactGitWriter,
  input: {
    repository: WorldRepository;
    sourceRef: ArtifactSourceRef;
    expectedMainCommitSha: string;
    requestId: string;
    nowMs: number;
  },
): Promise<{ status: "updated" | "alreadyCurrent"; mainCommitSha: string }> {
  if (input.sourceRef.repoId !== input.repository.repoId || input.sourceRef.repoName !== input.repository.repoName) {
    throw new ArtifactSourceError("repository_mismatch", "promoted source is not in the World's canonical repository");
  }
  const canonical = await provider.getRepository(input.repository.repoName);
  if (!canonical || canonical.repoId !== input.repository.repoId) {
    throw new ArtifactSourceError("repository_mismatch", "World canonical repository identity does not match");
  }
  const currentMain = await provider.resolveRef(input.repository.repoId, "main");
  if (!currentMain) throw new ArtifactSourceError("repository_uninitialized", "canonical repository has no main ref");
  if (currentMain !== input.expectedMainCommitSha) {
    const current = await sourceFromCommit(provider, input.repository, currentMain);
    if (current.contentDigest === input.sourceRef.contentDigest) {
      return { status: "alreadyCurrent", mainCommitSha: currentMain };
    }
    throw new ArtifactSourceError("baseline_conflict", "canonical main changed before post-promotion reconciliation");
  }
  const source = await readPinnedSource(provider, input.sourceRef);
  const token = await provider.createToken(input.repository.repoId, "write", TOKEN_TTL_SECONDS);
  assertToken(token, input.nowMs);
  try {
    const committed = await writer.writeCommit({
      repository: input.repository,
      token: token.value,
      branch: "main",
      expectedRefCommitSha: currentMain,
      baseCommitSha: currentMain,
      files: source.files,
      identity: commitIdentity(`Promote ${input.requestId}`, input.nowMs),
      force: false,
    });
    const observed = await sourceFromCommit(provider, input.repository, committed.commitSha, committed.treeSha);
    if (observed.contentDigest !== input.sourceRef.contentDigest) {
      throw new ArtifactSourceError("source_copy_mismatch", "post-promotion main sync changed source bytes");
    }
    return { status: "updated", mainCommitSha: committed.commitSha };
  } catch (error) {
    if ((error as { code?: string })?.code === "non_fast_forward") {
      throw new ArtifactSourceError("baseline_conflict", "non-force main reconciliation was rejected");
    }
    throw error;
  } finally {
    await revokeQuietly(provider, input.repository.repoId, token.id);
  }
}
