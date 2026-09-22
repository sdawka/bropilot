// Reviewer precheck (docs/AGENT-RUNTIME.md §8): rule-based, not a model call. Answers "does the
// diff stay inside the files the task's rule lines actually point at?" so `agent/agents/talk.ts`
// can run the reviewer at the mid tier when the answer is yes, and reserve the strong tier for a
// diff that reaches outside the task's own scope. Pure: no fs, no network, no state — a function
// of the changed-file list and the task's `props.codeRef` values.

/** Extract the repo-relative path a `props.codeRef` GitHub URL points at: the part after
 * `/blob/<ref>/`, with any `#L..` line anchor stripped. A codeRef that isn't a GitHub blob URL
 * (a bare path, or something else) is returned unchanged so it still matches literally. */
function pathOf(codeRef: string): string {
  const m = codeRef.match(/\/blob\/[^/]+\/([^#]+)/);
  const raw = m ? m[1] : codeRef;
  return raw.replace(/^\/+/, '');
}

/** A changed file is in scope when it sits at or under the path of at least one codeRef (either
 * direction of prefix match, so a codeRef naming a directory covers files under it, and a codeRef
 * naming one file inside a changed directory still counts). No codeRefs at all → nothing is in
 * scope, so an empty `codeRefs` list with any changed files is `scopeOk:false` on purpose: the
 * reviewer has nothing to check the diff's extent against. */
export function precheckDiff(changedFiles: string[], codeRefs: string[]): { scopeOk: boolean; extraFiles: string[] } {
  const prefixes = codeRefs.map(pathOf).filter(Boolean);
  const inScope = (f: string) =>
    prefixes.some((p) => f === p || f.startsWith(p.endsWith('/') ? p : `${p}/`) || p.startsWith(f.endsWith('/') ? f : `${f}/`));
  const extraFiles = changedFiles.filter((f) => !inScope(f));
  return { scopeOk: changedFiles.length > 0 && extraFiles.length === 0, extraFiles };
}
