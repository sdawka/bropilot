import git from "isomorphic-git";
import http from "isomorphic-git/http/web";

import { MemoryFS } from "./memory-fs";
import type { ArtifactGitWriter, ArtifactRepository } from "./source";
import { ArtifactSourceError, validateSourceBundle } from "./source";

const WORKSPACE = "/workspace";

function tokenSecret(token: string): string {
  const secret = token.split("?expires=", 1)[0];
  if (!secret) throw new ArtifactSourceError("token_scope_invalid", "Artifacts Git token is empty");
  return secret;
}

async function remoteRef(
  repository: ArtifactRepository,
  token: string,
  branch: string,
): Promise<string | null> {
  const refs = await git.listServerRefs({
    http,
    url: repository.remote,
    prefix: `refs/heads/${branch}`,
    onAuth: () => ({ username: "x", password: tokenSecret(token) }),
  });
  return refs.find((entry) => entry.ref === `refs/heads/${branch}`)?.oid ?? null;
}

export class IsomorphicGitWriter implements ArtifactGitWriter {
  async writeCommit(input: Parameters<ArtifactGitWriter["writeCommit"]>[0]): Promise<{ commitSha: string; treeSha: string }> {
    if (input.force !== false) throw new ArtifactSourceError("force_push_rejected", "Artifacts writes must never force push");
    const files = validateSourceBundle({ files: input.files });
    const remoteHead = await remoteRef(input.repository, input.token, input.branch);
    if (remoteHead !== input.expectedRefCommitSha) {
      throw new ArtifactSourceError("non_fast_forward", "remote Git ref changed before commit");
    }

    const fs = new MemoryFS();
    if (input.baseCommitSha) {
      await git.clone({
        fs,
        http,
        dir: WORKSPACE,
        url: input.repository.remote,
        ref: "main",
        singleBranch: true,
        depth: 1,
        noTags: true,
        onAuth: () => ({ username: "x", password: tokenSecret(input.token) }),
      });
      const clonedHead = await git.resolveRef({ fs, dir: WORKSPACE, ref: "HEAD" });
      if (clonedHead !== input.baseCommitSha) {
        throw new ArtifactSourceError("non_fast_forward", "shallow canonical baseline did not match the pinned commit");
      }
      if (input.branch !== "main") {
        await git.branch({ fs, dir: WORKSPACE, ref: input.branch, checkout: true });
      }
      const tracked = await git.listFiles({ fs, dir: WORKSPACE });
      if (tracked.length > 64) throw new ArtifactSourceError("source_limit", "baseline checkout exceeds the file limit");
      for (const filepath of tracked) await git.remove({ fs, dir: WORKSPACE, filepath });
    } else {
      await git.init({ fs, dir: WORKSPACE, defaultBranch: input.branch });
    }

    for (const [filepath, contents] of Object.entries(files)) {
      await fs.promises.writeFile(`${WORKSPACE}/${filepath}`, contents);
      await git.add({ fs, dir: WORKSPACE, filepath });
    }
    const commitSha = await git.commit({
      fs,
      dir: WORKSPACE,
      message: input.identity.message,
      author: input.identity.author,
      committer: input.identity.author,
    });
    const commit = await git.readCommit({ fs, dir: WORKSPACE, oid: commitSha });
    const pushed = await git.push({
      fs,
      http,
      dir: WORKSPACE,
      url: input.repository.remote,
      ref: input.branch,
      remoteRef: input.branch,
      force: false,
      onAuth: () => ({ username: "x", password: tokenSecret(input.token) }),
    });
    if (!pushed.ok) {
      throw new ArtifactSourceError("non_fast_forward", `non-force Git push failed: ${pushed.error ?? "unknown error"}`);
    }
    return { commitSha, treeSha: commit.commit.tree };
  }
}
