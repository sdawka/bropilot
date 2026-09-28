// Reviewer precheck (docs/AGENT-RUNTIME.md §8): rule-based, not a model call. Answers "does the
// diff stay inside the files the task's rule lines actually point at?" so `agent/agents/talk.ts`
// can run the reviewer at the mid tier when the answer is yes, and reserve the strong tier for a
// diff that reaches outside the task's own scope. Pure: no fs, no network, no state — a function
// of the changed-file list and the task's `props.codeRef` values.
//
// v4.3 (System One, AGENT-RUNTIME.md §9): `tierFor` folds in Jev's optional `risk` read of the
// change (a `score` answer over 4 levels: routine/moderate/sensitive/high-risk) so a diff that
// stays inside scope but touches something Jev reads as sensitive-or-worse, confidently, still
// gets the strong tier. Still pure — the caller (talk.ts::run_review) does the asking.

import { thresholdFor } from '../../src/ai/decisionConfig.ts';

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

/** The reviewer tier: 'strong' when the diff reaches outside the task's own scope (`!scopeOk`),
 * or when Jev's `risk` read is both confident (≥ threshold) and at or past 'sensitive' — the
 * third of the four levels `['routine','moderate','sensitive','high-risk']` a `risk` score is an
 * index into, so `levels - 2` names that level regardless of how many levels the caller used.
 * Otherwise 'mid' — including every case where `risk` is absent (no System One, or it errored). */
export function tierFor(
  scopeOk: boolean,
  risk?: { score: number; confidence: number; levels: number },
  threshold = thresholdFor('reviewer-tier'),
): 'mid' | 'strong' {
  if (!scopeOk) return 'strong';
  if (risk) {
    const sensitiveIndex = risk.levels - 2;
    if (risk.confidence >= threshold && risk.score >= sensitiveIndex) return 'strong';
  }
  return 'mid';
}
