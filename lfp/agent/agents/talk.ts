// Talk: the one conversation the user has (docs/AGENT-RUNTIME.md §3). Top-level Flue agent with
// the Cue tools, the observer and planner as delegates, and two tools that run the builder and
// reviewer as their own conversations (they need their own sandbox and budget, which delegates
// cannot have). The clarifier is not an agent: it is the paragraph below about raise_question.
import { useSubagent, defineTool, init, useAgentStart, useAgentFinish, usePersistentState } from '@flue/runtime';
import * as v from 'valibot';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { agentById } from '../../src/agents.ts';
import { applySpec, asSubagent, tierOverrideEnvKey } from './from-spec.ts';
import { diffChangedFiles } from './tools.ts';
import { precheckDiff, tierFor } from './precheck.ts';
import { askSystem1, system1Available } from '../system1.ts';
import { answerConfidence } from '../../src/ai/decisionConfig.ts';
import { busRef } from '../bus-ref.ts';
import { Observer } from './observer.ts';
import { Planner } from './planner.ts';
import { Builder } from './builder.ts';
import { Reviewer } from './reviewer.ts';

const LFP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// prompt.md is generated from src/ai/registry.ts (npm run docs); a missing file never crashes the server.
let PROMPT = '';
try {
  PROMPT = readFileSync(join(LFP, 'agent', 'prompt.md'), 'utf8');
} catch {
  PROMPT = '';
}

/** Append one task's verdict to `src/reality.json`, preserving `results`/`metrics` (and every
 * other task's verdict). `run_review` runs inside this Node server process (docs/AGENT-RUNTIME.md
 * §7), so writing with `fs` here is the whole mechanism — nothing round-trips through the bus. */
function writeVerdict(taskId: string, record: { verdict: string; reasons: string[]; at: string; scopeOk?: boolean; risk?: { score: number; confidence: number } }) {
  const path = join(LFP, 'src', 'reality.json');
  let reality: { results?: unknown; metrics?: unknown; verdicts?: Record<string, unknown> } = {};
  try {
    reality = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    reality = { results: {}, metrics: {} };
  }
  reality.verdicts = { ...(reality.verdicts ?? {}), [taskId]: record };
  writeFileSync(path, JSON.stringify(reality, null, 2));
}

// What changes between turns never goes into the instructions. Any byte that moves in the system
// prompt invalidates the provider's prompt cache for the whole history behind it (pi-ai puts one
// Anthropic cache_control breakpoint on the system prompt, one on the last tool, one on the last
// message), and Flue answers a changed instruction digest with a "System instructions updated"
// signal the model replies to. So server.mjs hands the per-turn facts here right before dispatch,
// and `useAgentStart` below appends them to the conversation as signals:
//   screen — every turn: the catch-up note (controls the user applied) + the screen line;
//   kernel — only when the kernel digest's hash differs from the last one this conversation saw;
//   graph  — only when the committed graph's digest hash differs (titles by kind + edges).
// The last-seen hashes live in usePersistentState, so they survive a server restart and a new
// session conversation starts from nothing (and gets both).
export interface TurnSignals { screen: string; kernel?: string; graph?: string; turn: number }
let turnSignals: TurnSignals = { screen: '(no context yet — waiting for the main screen)', turn: 0 };
export function setTurnSignals(next: Omit<TurnSignals, 'turn'>) { turnSignals = { ...next, turn: turnSignals.turn + 1 }; }

const hash8 = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 8);

const clipTitle = (t: string, n = 60) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** A compact committed-graph digest, capped at `maxLines`: one line per kind (`kind (n): Title
 * [id]; …`, at most 8 per kind), then edges as `A —type→ B` by title. What does not fit is counted
 * on the last line, so the model knows to call read_graph for the rest. */
export function graphDigest(graph: { nodes: { id: string; kind: string; title: string }[]; edges: { src: string; dst: string; type: string }[] } | null | undefined, maxLines = 60): string {
  if (!graph || !graph.nodes?.length) return '(empty graph)';
  const byKind = new Map<string, { id: string; title: string }[]>();
  for (const n of graph.nodes) {
    if (!byKind.has(n.kind)) byKind.set(n.kind, []);
    byKind.get(n.kind)!.push(n);
  }
  const PER_KIND = 8;
  const lines: string[] = [`${graph.nodes.length} nodes, ${graph.edges.length} edges.`];
  let hiddenKinds = 0;
  for (const [kind, nodes] of byKind) {
    if (lines.length >= Math.floor(maxLines * 0.6)) { hiddenKinds++; continue; }
    const shown = nodes.slice(0, PER_KIND).map((n) => `${clipTitle(n.title, 50)} [${n.id}]`).join('; ');
    lines.push(`${kind} (${nodes.length}): ${shown}${nodes.length > PER_KIND ? `; +${nodes.length - PER_KIND} more` : ''}`);
  }
  if (hiddenKinds) lines.push(`+${hiddenKinds} more kinds (read_graph by kind)`);
  const title = new Map(graph.nodes.map((n) => [n.id, clipTitle(n.title, 40)]));
  lines.push('Edges:');
  const room = maxLines - lines.length - 1;
  for (const e of graph.edges.slice(0, Math.max(0, room))) lines.push(`${title.get(e.src) ?? e.src} —${e.type}→ ${title.get(e.dst) ?? e.dst}`);
  const hiddenEdges = graph.edges.length - Math.max(0, room);
  if (hiddenEdges > 0) lines.push(`+${hiddenEdges} more edges (read_graph by id or title for the rest)`);
  return lines.join('\n');
}

/** Tools that count as speaking to the user for the one-utterance contract (HEADER_RULES). */
const SPEAKING_TOOLS = new Set(['say', 'ask', 'stage', 'answer', 'raise_question']);
let nudgedTurn = -1; // the dispatch the contract signal was last appended for (at most once each)

/** Run the builder on one work order in its own durable conversation (id = task id) and return its final text. */
const dispatchTask = defineTool({
  name: 'dispatch_task',
  description: 'Hand a work order (the markdown from scripts/dispatch.mjs) to the builder agent for one task id, wait for it, and return its report. Use after the user approved the task.',
  input: v.object({ taskId: v.string(), workOrder: v.string() }),
  async run({ data }: any) {
    const builder = init(Builder, { id: `builder:${data.taskId}` });
    const receipt = await builder.dispatch(data.workOrder);
    const reply = await builder.read(receipt);
    return { output: { taskId: data.taskId, report: reply.text } };
  },
});

/** Read `src/graph.json` fresh (it can change between calls) just far enough to name the titles
 * of the tests this task targets and the rules those tests verify — the only two facts `risk`
 * below is allowed to see besides the file lists. Never throws; an unreadable/malformed graph
 * just yields no titles, so the risk question falls back to judging on file counts alone. */
function reviewContextOf(taskId: string): { tests: string[]; rules: string[] } {
  try {
    const graph = JSON.parse(readFileSync(join(LFP, 'src', 'graph.json'), 'utf8')) as { nodes: any[]; edges: any[] };
    const tests = graph.edges.filter((e) => e.src === taskId && e.type === 'targets').map((e) => graph.nodes.find((n) => n.id === e.dst)).filter(Boolean);
    const ruleIds = new Set<string>();
    for (const t of tests) for (const e of graph.edges) if (e.src === t.id && e.type === 'verifies') ruleIds.add(e.dst);
    const rules = Array.from(ruleIds).map((rid) => graph.nodes.find((n: any) => n.id === rid)).filter(Boolean);
    return { tests: tests.map((t: any) => t.title), rules: rules.map((r: any) => r.title) };
  } catch {
    return { tests: [], rules: [] };
  }
}

/** The four levels a `risk` score answer is an index into — routine/moderate/sensitive/high-risk
 * (`precheck.ts::tierFor` reads "sensitive" as `levels - 2`, i.e. index 2 here). */
const RISK_LEVELS = ['routine', 'moderate', 'sensitive', 'high-risk'];

/** Ask Jev how risky this diff looks to review, given only file counts/paths, the targeted tests'
 * titles and the rules they verify — never the diff itself (S1 reads literally and gets worse
 * with irrelevant material). Returns undefined on any error or when System One is unavailable, so
 * `precheck.ts::tierFor` falls back to today's scope-only behaviour. */
async function askReviewRisk(taskId: string, precheck: { scopeOk: boolean; extraFiles: string[] }, fileCount: number): Promise<{ score: number; confidence: number; levels: number } | undefined> {
  if (!system1Available()) return undefined;
  try {
    const { tests, rules } = reviewContextOf(taskId);
    const state = { fileCount, scopeOk: precheck.scopeOk, extraFiles: precheck.extraFiles.slice(0, 20), tests, rules };
    const reply = await askSystem1(state, {
      risk: {
        type: 'score',
        instructions: 'How risky is this change to review, given only which files it touched relative to the tests it targets and the rules those tests verify? routine = only files the targeted tests point at; moderate = a few files nearby; sensitive = shared or kernel code; high-risk = many unrelated files or the kernel itself.',
        criteria: [
          'routine: only the files the targeted tests point at',
          'moderate: a few nearby files',
          'sensitive: shared or kernel code',
          'high-risk: many unrelated files or the kernel itself',
        ],
      },
    });
    const ans = reply.answers.risk as { type: 'score'; score: number; confidence: number };
    const risk = { score: ans.score, confidence: answerConfidence(ans as any), levels: RISK_LEVELS.length };
    console.log(`[system1] reviewer-tier score=${risk.score} conf=${risk.confidence.toFixed(2)} → ${tierFor(precheck.scopeOk, risk)}`);
    return risk;
  } catch (err) {
    console.log(`[system1] reviewer-tier: unavailable (${(err as Error).message}) → scope-only`);
    return undefined;
  }
}

/** Run the reviewer on a finished task and return its verdict tool output (or its text if it never
 * called verdict). Precheck first (docs/AGENT-RUNTIME.md §8, rule-based): `git diff --name-only` in
 * the worktree against the task's `codeRefs` decides scope; v4.3 also asks Jev (System One) how
 * risky the touched files look next to the targeted tests/rules (`askReviewRisk` above), and
 * `precheck.ts::tierFor(scopeOk, risk)` folds both into the reviewer's tier — mid unless the diff
 * reaches outside scope, or Jev confidently reads it as sensitive-or-worse (via the
 * `TIER_OVERRIDE_REVIEWER` env var `from-spec.ts::modelFor` reads; `Reviewer()` itself never
 * changes). The verdict, once it arrives, is written into `src/reality.json.verdicts[taskId]` here
 * (server-side, see `writeVerdict` above), alongside `scopeOk` and `risk`, and published as a
 * `reality` bus message — the browser has no handler for it yet, so it is a no-op there. */
const runReview = defineTool({
  name: 'run_review',
  description: "Ask the reviewer agent to judge a finished task: pass the task id, the rule/test brief, the worktree path (cwd), and the task's codeRefs. Runs a rule-based precheck (changed files vs. codeRefs) plus, when System One is on, a risk read of the touched files, to pick mid or strong tier, records the verdict (with scopeOk and risk) in reality.json, and returns it.",
  input: v.object({ taskId: v.string(), brief: v.string(), cwd: v.optional(v.string()), codeRefs: v.optional(v.array(v.string())) }),
  async run({ data }: any) {
    const cwd = data.cwd ?? process.cwd();
    const changedFiles = await diffChangedFiles(cwd);
    const precheck = precheckDiff(changedFiles, data.codeRefs ?? []);
    const risk = await askReviewRisk(data.taskId, precheck, changedFiles.length);
    const tier = tierFor(precheck.scopeOk, risk);
    const envKey = tierOverrideEnvKey('reviewer');
    if (tier === 'mid') process.env[envKey] = 'mid';
    else delete process.env[envKey];
    const brief = [
      data.brief,
      '',
      '## Precheck (rule-based, not a model judgement)',
      `Changed files: ${changedFiles.join(', ') || '(none)'}`,
      precheck.scopeOk
        ? "Stays inside the task's codeRefs."
        : `Touches files outside the task's codeRefs (${precheck.extraFiles.join(', ') || 'no codeRefs given'}).`,
      risk ? `System One reads the risk as "${RISK_LEVELS[risk.score] ?? risk.score}" (confidence ${risk.confidence.toFixed(2)}).` : null,
      `Running at ${tier} tier.`,
    ].filter(Boolean).join('\n');
    try {
      const reviewer = init(Reviewer, { id: `reviewer:${data.taskId}` });
      const receipt = await reviewer.dispatch(brief);
      let verdict: unknown = null;
      const reply = await reviewer.read(receipt, {
        onEvent(chunk: any) {
          if (chunk.type === 'tool-output' && chunk.toolName === 'verdict') verdict = chunk.output;
        },
      });
      if (verdict && typeof verdict === 'object') {
        const record = {
          verdict: (verdict as any).verdict,
          reasons: (verdict as any).reasons ?? [],
          at: new Date().toISOString(),
          scopeOk: precheck.scopeOk,
          ...(risk ? { risk: { score: risk.score, confidence: risk.confidence } } : {}),
        };
        writeVerdict(data.taskId, record);
        void (busRef as any).publishReality?.({ taskId: data.taskId, ...record });
      }
      return { output: { taskId: data.taskId, verdict, text: reply.text, scopeOk: precheck.scopeOk, extraFiles: precheck.extraFiles, tier, risk: risk ?? null } };
    } finally {
      delete process.env[envKey];
    }
  },
});

export function Talk() {
  const header = applySpec(agentById.talk, { extraTools: [dispatchTask, runReview], compactionTier: 'cheap' });
  useSubagent(asSubagent(agentById.observer, Observer, 'Run the kernel checks and the test suite and summarise; use when the user asks what is failing or after a commit.'));
  useSubagent(asSubagent(agentById.planner, Planner, 'Turn the top open task-raising item into a staged epic and tasks; use when the user asks what to build next.'));

  const [seen, setSeen] = usePersistentState<{ kernel?: string; graph?: string }>('signals:seen', {});
  useAgentStart((ctx) => {
    const { screen, kernel, graph } = turnSignals;
    const next = { ...seen };
    if (kernel) {
      const h = hash8(kernel);
      if (h !== seen.kernel) { ctx.append({ kind: 'signal', type: 'kernel', body: kernel, attributes: { hash: h } }); next.kernel = h; }
    }
    if (graph) {
      const h = hash8(graph);
      if (h !== seen.graph) { ctx.append({ kind: 'signal', type: 'graph', body: graph, attributes: { hash: h } }); next.graph = h; }
    }
    ctx.append({ kind: 'signal', type: 'screen', body: screen });
    const sent = ['screen', next.kernel !== seen.kernel ? 'kernel' : '', next.graph !== seen.graph ? 'graph' : ''].filter(Boolean);
    console.log(`[signals] ${sent.join(' + ')} (screen ${screen.length} chars${sent.includes('graph') ? `, graph ${graph!.length} chars` : ''})`);
    if (next.kernel !== seen.kernel || next.graph !== seen.graph) setSeen(next);
  });

  // The contract, enforced once per dispatch: a response that is about to settle without saying,
  // asking or staging anything gets one `contract` signal and another turn. server.mjs keeps its
  // text/delegate fallbacks as the second line (a model that ignores this still reaches the screen).
  useAgentFinish((ctx) => {
    if (ctx.response.toolCalls.some((c) => !c.isError && SPEAKING_TOOLS.has(c.tool))) return;
    if (nudgedTurn === turnSignals.turn) return;
    nudgedTurn = turnSignals.turn;
    ctx.append({
      kind: 'signal',
      type: 'contract',
      body: 'You are about to end this response without calling say, ask or stage, so the user sees nothing. Call say now (or ask, or stage) with your answer in two sentences or fewer. Do not repeat tool calls you already made.',
    });
  });

  return `${header}

${PROMPT}

## Clarification path (the "clarifier")
When you, the builder, or the reviewer cannot derive a measurable done-criterion from a rule's lines and its tests, or a line admits several plausible readings, call raise_question: name the subject nodes, what is missing, and the readings considered. The task becomes blocked; when the user answers, resume it by calling dispatch_task again with the answer appended to the work order.

## Signals: the screen, the kernel and the graph
These instructions never change. What changes arrives in the conversation as signals right after each user message:
- \`screen\` (every user message): what happened since your last turn (commits, discards, undos the user applied), then the current view, visible titles, the next open item, the staged changeset and any pending ask. This is the \`context\` the rules above refer to (\`context.screen\`, \`context.next\`, \`context.gaps\`). Your tool results carry the same context, fresher, after each call.
- \`kernel\` (only when it changed): the kernel digest — the graph's kinds, edge rules and invariants.
- \`graph\` (only when the committed graph changed): titles by kind with ids in brackets, and edges as \`A —type→ B\`. Use it before calling read_graph; call read_graph only for what the digest cut off or for a node's details.
The most recent signal of each type is the truth; earlier ones are history.`;
}
Talk.agentName = 'Talk';
