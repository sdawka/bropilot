// Agent-side tools that are not Cues: repository inspection, running the observed test suite,
// running the kernel checks over the last graph snapshot, and the reviewer's structured verdict.
// Everything a spec names in `tools` resolves through `toolById` (cue tools come from ../tools.ts).
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cueTools } from '../tools.ts';
import { busRef } from '../bus-ref.ts';
import { checkInvariants } from '../../src/checks.ts';

const LFP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.slice(-8000) });
    });
  });
}

// Read-only repository inspection plus worktree creation. Anything that rewrites history or
// pushes is refused here on purpose: the commit gate, not the builder, decides what lands.
const REPO_ALLOWED: Record<string, (a: string[]) => boolean> = {
  status: () => true,
  diff: () => true,
  log: (a) => a.every((x) => /^(-n|--oneline|-\d+|--stat|[\w./-]+)$/.test(x)),
  show: (a) => a.length <= 2,
  worktree: (a) => a[0] === 'add' || a[0] === 'list',
  branch: (a) => a.length === 0 || a[0] === '--show-current',
};
/** Plain (non-Flue-tool) helper so `talk.ts::run_review` can get the changed-file list for the
 * precheck without going through a model tool-call. `diff` is already allowed with any args
 * (including `--name-only`) by `REPO_ALLOWED` above, so this reuses the same allow-listed command. */
export async function diffChangedFiles(cwd: string): Promise<string[]> {
  const r = await run('git', ['diff', '--name-only'], cwd, 60_000);
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean);
}

export const repo = defineTool({
  name: 'repo',
  description: 'Inspect the repository: git status | diff [paths] | log -n N | show <ref> | branch | worktree add <dir> v4 | worktree list. Nothing else.',
  input: v.object({ subcommand: v.string(), args: v.optional(v.array(v.string())), cwd: v.optional(v.string()) }),
  async run({ data }: any) {
    const check = REPO_ALLOWED[data.subcommand];
    const args = data.args ?? [];
    if (!check || !check(args)) return { output: `refused: git ${data.subcommand} ${args.join(' ')} is not in the allow-list` };
    const r = await run('git', [data.subcommand, ...args], data.cwd ?? LFP, 60_000);
    return { output: `exit ${r.code}\n${r.out}` };
  },
});

export const runTests = defineTool({
  name: 'run_tests',
  description: 'Run the observed test suite (npm run observe) in the given checkout and return its summary line plus the resulting reality.json.',
  input: v.object({ cwd: v.optional(v.string()) }),
  async run({ data }: any) {
    const cwd = data.cwd ?? LFP;
    const r = await run('npm', ['run', 'observe'], cwd, 600_000);
    let reality = '';
    try {
      reality = readFileSync(join(cwd, 'src', 'reality.json'), 'utf8');
    } catch {
      reality = '(no reality.json written)';
    }
    const lines = r.out.trim().split('\n');
    return { output: { exit: r.code, summary: lines[lines.length - 1] ?? '', reality } };
  },
});

export const runChecks = defineTool({
  name: 'run_checks',
  description: 'Run the kernel constraint checks over the last graph snapshot from the main screen and return the violations grouped by invariant.',
  async run() {
    const snap = busRef.getSnapshot();
    if (!snap) return { output: 'no graph snapshot yet: the main screen has not connected' };
    const violations = checkInvariants(snap.graph as any);
    const grouped: Record<string, string[]> = {};
    for (const x of violations) (grouped[x.invariant] ??= []).push(x.message);
    return { output: { count: violations.length, byInvariant: grouped } };
  },
});

export const verdict = defineTool({
  name: 'verdict',
  description: 'The reviewer’s final answer: does the change serve the rule’s intent (serves-intent), only the test (overfits), or can’t tell (unclear)? Call exactly once.',
  input: v.object({ verdict: v.picklist(['serves-intent', 'overfits', 'unclear']), reasons: v.array(v.string()), taskId: v.optional(v.string()) }),
  async run({ data }: any) {
    return { output: data };
  },
});

export const agentTools = [repo, runTests, runChecks, verdict];

/** Resolve a spec's tool ids to Flue tool definitions (cue tools by `.name`, then agent tools). Unknown ids throw at boot. */
export function toolsFor(ids: string[], extra: { name: string }[] = []) {
  const all = [...cueTools, ...agentTools, ...extra] as { name: string }[];
  return ids.map((id) => {
    const t = all.find((x) => x.name === id);
    if (!t) throw new Error(`agent spec names unknown tool '${id}'`);
    return t;
  });
}
