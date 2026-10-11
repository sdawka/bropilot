import type {
  ArtifactRepository,
  ArtifactRepositoryProvider,
  ArtifactToken,
  ArtifactTreeEntry,
} from "./source";

const MAX_TREE_ENTRIES = 128;
const MAX_TREE_DEPTH = 16;

function sourceError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { name: "ArtifactSourceError", code });
}

function repositoryMetadata(info: Pick<ArtifactsRepoInfo, "id" | "name" | "remote">): ArtifactRepository {
  return { repoId: info.id, repoName: info.name, remote: info.remote };
}

function expiryFromInitialToken(token: string): number {
  const marker = "?expires=";
  const index = token.indexOf(marker);
  if (index < 0) throw sourceError("token_scope_invalid", "Artifacts initial token has no expiry metadata");
  const seconds = Number(token.slice(index + marker.length));
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw sourceError("token_scope_invalid", "Artifacts initial token has invalid expiry metadata");
  }
  return seconds * 1_000;
}

function issuedToken(result: ArtifactsCreateTokenResult): ArtifactToken {
  return {
    id: result.id,
    value: result.plaintext,
    expiresAtMs: Date.parse(result.expiresAt),
  };
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: string })?.code === "NOT_FOUND";
}

export class CloudflareArtifactsProvider implements ArtifactRepositoryProvider {
  readonly #namesById = new Map<string, string>();
  readonly binding: Artifacts;

  constructor(binding: Artifacts) {
    this.binding = binding;
  }

  async #openByName(name: string): Promise<ArtifactsRepo> {
    return this.binding.get(name);
  }

  async #openById(repoId: string): Promise<ArtifactsRepo> {
    const name = this.#namesById.get(repoId);
    if (!name) throw sourceError("repository_mismatch", "repository ID has not been resolved in this request");
    return this.#openByName(name);
  }

  #remember(repository: ArtifactRepository): ArtifactRepository {
    this.#namesById.set(repository.repoId, repository.repoName);
    return repository;
  }

  async getRepository(repoName: string): Promise<ArtifactRepository | null> {
    try {
      const repo = await this.#openByName(repoName);
      return this.#remember(repositoryMetadata(await repo.info()));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async #replaceInitialToken(
    repository: ArtifactRepository,
    initialToken: string,
    ttlSeconds: number,
  ): Promise<ArtifactToken> {
    const repo = await this.#openByName(repository.repoName);
    expiryFromInitialToken(initialToken);
    await repo.revokeToken(initialToken);
    return issuedToken(await repo.createToken("write", ttlSeconds));
  }

  async createRepository(repoName: string): Promise<{ repository: ArtifactRepository; writeToken: ArtifactToken }> {
    const created = await this.binding.create(repoName, {
      readOnly: false,
      description: "Bropilot canonical World source",
      setDefaultBranch: "main",
    });
    const repository = this.#remember(repositoryMetadata(created));
    return {
      repository,
      writeToken: await this.#replaceInitialToken(repository, created.token, 300),
    };
  }

  async forkRepository(
    repoId: string,
    forkName: string,
    options: { defaultBranchOnly: true; readOnly: false; ttlSeconds: number },
  ): Promise<{ repository: ArtifactRepository; writeToken: ArtifactToken }> {
    const source = await this.#openById(repoId);
    const created = await source.fork(forkName, {
      readOnly: options.readOnly,
      defaultBranchOnly: options.defaultBranchOnly,
      description: "Bropilot isolated Realization",
    });
    const repository = this.#remember(repositoryMetadata(created));
    return {
      repository,
      writeToken: await this.#replaceInitialToken(repository, created.token, options.ttlSeconds),
    };
  }

  async createToken(repoId: string, access: "write", ttlSeconds: number): Promise<ArtifactToken> {
    const repo = await this.#openById(repoId);
    return issuedToken(await repo.createToken(access, ttlSeconds));
  }

  async revokeToken(repoId: string, tokenId: string): Promise<void> {
    const repo = await this.#openById(repoId);
    await repo.revokeToken(tokenId);
  }

  async resolveRef(repoId: string, ref: string): Promise<string | null> {
    const repo = await this.#openById(repoId);
    const commits = await repo.log({ ref, limit: 1, offset: 0 });
    return commits[0]?.hash ?? null;
  }

  async readCommit(repoId: string, commitSha: string): Promise<{ commitSha: string; treeSha: string } | null> {
    const commit = await (await this.#openById(repoId)).readCommit(commitSha);
    return commit ? { commitSha: commit.hash, treeSha: commit.treeHash } : null;
  }

  async readTree(repoId: string, treeSha: string): Promise<ArtifactTreeEntry[] | null> {
    const repo = await this.#openById(repoId);
    const root = await repo.readTree(treeSha);
    if (!root) return null;
    const flattened: ArtifactTreeEntry[] = [];
    const visit = async (entries: ArtifactsTreeEntry[], prefix: string, depth: number): Promise<void> => {
      if (depth > MAX_TREE_DEPTH) throw sourceError("source_limit", "source tree exceeds the depth limit");
      for (const entry of entries) {
        if (flattened.length >= MAX_TREE_ENTRIES) {
          throw sourceError("source_limit", "source tree exceeds the entry limit");
        }
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.type === "tree") {
          const children = await repo.readTree(entry.hash);
          if (!children) throw sourceError("tree_missing", `nested source tree is missing: ${path}`);
          await visit(children, path, depth + 1);
        } else {
          flattened.push({
            path,
            type: entry.type === "blob" || entry.type === "exec" || entry.type === "symlink"
              ? "blob"
              : "commit",
            mode: entry.mode,
            sha: entry.hash,
          });
        }
      }
    };
    await visit(root, "", 0);
    return flattened;
  }

  async readBlob(repoId: string, blobSha: string): Promise<Uint8Array | null> {
    const blob = await (await this.#openById(repoId)).readBlob(blobSha);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }
}
