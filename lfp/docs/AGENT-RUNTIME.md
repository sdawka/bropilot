# Agent runtime — how Bropilot's agents are built on Flue

Hand-written guide (not generated). Read this before touching anything under `agent/` or `src/agents.ts`. It records what we verified about `@flue/runtime` 2.0.6 (docs at `node_modules/@flue/runtime/docs/guide/*.md`) and the decisions taken on 2026-09-21. The table of agents itself lives in `src/agents.ts` and renders in-app and in `docs/AGENTS.md`; this file explains the why and the how.

## 1. The shape of the system

Three loops, each closed by a different party:

| Loop | Fails when | Raised as | Closed by |
|---|---|---|---|
| Meta (kernel constraints) | graph shape / cardinality / condition coverage broken | a **question** (`FollowUp.raisedBy.kind = 'violation'`) | the user answering through Talk |
| Representation → reality | a rule's condition has no fresh passing test | a **task** targeting the tests | a Builder agent in a sandbox, then a Reviewer |
| Clarification | an agent cannot derive a measurable "done" | a **question** (`raisedBy.kind = 'agent'`, task → `blocked`) | the user answering; the task resumes |

Everything an agent does to the graph goes through the commit gate (`stage` → approve → `commit`). The only exceptions are glossary edits and task state transitions.

## 2. What Flue gives us (verified against 2.0.6)

- **An agent is a function that returns its system prompt** and re-renders before every model turn. Hooks compose it: `useModel('provider/model', { thinkingLevel })`, `useTool(defineTool({...}))`, `useSandbox(adapter)`, `useSubagent({ name, description, agent, model?, thinkingLevel? })`, `usePersistentState(key, init)`, `useAgentStart/useAgentFinish`, `useMcpConnection`. (`guide/models.md`, `guide/tools.md`, `guide/subagents.md`)
- **Tiers are subagents — with a limit.** `useSubagent` adds a `task` tool; the parent model delegates by name. The child runs in a fresh context (inherits sandbox + workspace only, never the parent's history or tools), may use a different model and thinking level, runs in parallel with siblings, depth ≤ 4, and resumes from its own durable transcript after a crash. **Inside a delegate, `useModel`, `useSandbox` and `usePersistentState` throw** (verified, `guide/subagents.md`): its model comes from the definition, it shares the parent's sandbox, and it has no state of its own. So anything that needs its own sandbox or budget (builder, reviewer) is a **top-level agent** with its own conversation, started by a tool in Talk (`init(Builder, { id })`), not a delegate. Observer and planner are delegates.
- **Per-turn model choice.** `useModel` runs on every render, so an agent can escalate mid-conversation by reading `usePersistentState`. Tool subsets are just conditional `useTool` calls; the runtime tells the model when tools appear or disappear.
- **Durability.** Every submission is recorded before work starts and owes one terminal outcome (`completed | failed | aborted`); default 10 attempts, 1 h timeout, overridable per agent (`Agent.durability = { maxAttempts, timeoutMs }`). Persistence adapters: in-memory (default), `sqlite(path)`, custom; a DB adapter (Postgres) coordinates replicas. Sessions resume with `init(Agent, { id })`. One live owner per conversation; you cannot dispatch from one process and read the in-flight stream from another. (`guide/durability.md`)
- **Observability.** `observe(cb)` streams every event with correlation ids (`agentName, conversationId, submissionId, turnId, taskId`): `submission_settled` is the reliable terminal signal; `turn` carries `response.usage` (input, output, cache read/write, cost); `tool_start/tool`, `task_start/task`, `log`, `compaction`. This is where `AICall` records and budgets come from. (`guide/observability.md`)
- **Structured output** only on tools (`defineTool({ output: v.object(...) })`) and on `harness.prompt(text, { result: schema })`; the top-level reply is text. So every result we care about is returned through a tool, never parsed from prose.
- **Sandboxes.** `bash()` = in-memory emulated Linux (just-bash), rebuilt per message, good for data work; `local()` = host fs + shell, no isolation; remote adapters via `flue add sandbox <provider>` for **E2B, Daytona, Modal, Cloudflare Sandbox, Cloudflare Computer**, lazily created per agent instance and reconnected for durability. (`guide/sandbox*.md`, `ecosystem/`)
- **Deployment.** `vite build` with `@flue/vite` → `dist/server.mjs` standalone Node HTTP server, or Cloudflare Workers where each agent is a Durable Object. Clients use `@flue/sdk` `createFlueClient({ url, token })` against `https://host/agents/<path>/<conversation-id>`; streaming is HTTP GET with backoff; auth is bearer/headers, application-defined. No hosted Flue service, no agent registry, no agent-to-agent network calls. (`cli/`, `sdk/`, `ecosystem/cloudflare.md`)
- **Providers.** `'provider/model-id'` specifiers over anthropic, openai, google, bedrock, vertex, groq, mistral, openrouter, cloudflare (Workers AI, no key)…; keys from the environment only; custom providers via `setProvider(createProvider(...))`; no built-in fallback (the agent function decides).

## 3. The agents

Declared once in `src/agents.ts` as `AGENTS: AgentSpec[]` (field `hosting: 'top' | 'delegate' | 'path'` records the choice above) (Node-runnable, explicit `.ts` imports, provenance on every entry), rendered on the Reference page and emitted to `docs/AGENTS.md`. `agent/agents/<id>.ts` implements each one as a Flue function whose hooks are driven by the spec, so the spec is the single source of truth for model, tools, budget and checkpoint.

```ts
export interface AgentSpec {
  id: 'talk' | 'observer' | 'planner' | 'builder' | 'reviewer' | 'clarifier';
  version: string;
  purpose: string;
  tier: 'none' | 'cheap' | 'mid' | 'strong';       // resolved to a model id by TIER_MODELS
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  tools: string[];                                  // tool ids from agent/tools.ts and agent/agents/tools/*
  aiFunctions: string[];                            // ids from src/ai/registry.ts this agent is allowed to call
  sandbox: 'none' | 'bash' | 'local' | 'remote';    // remote = the configured provider (E2B first)
  trigger: 'user-turn' | 'event' | 'schedule' | 'delegate';
  checkpoint: 'commit-gate' | 'auto-stage' | 'clarify-block' | 'none';
  budget: { maxTurns: number; maxWallMs: number; maxCostUsd: number };
  runsIn: 'browser' | 'local-node' | 'cloud' | 'sandbox';
  source: Provenance;
}
// Provider decision (2026-09-21): OpenRouter. One key (`OPENROUTER_API_KEY`), every vendor's models
// reachable as `openrouter/<vendor>/<model>`, swappable per tier without code changes. Direct
// `anthropic/...` specifiers still work when ANTHROPIC_API_KEY is set — TIER_MODELS is the only place
// that knows which.
export const TIER_MODELS = {
  cheap: 'openrouter/anthropic/claude-haiku-4.5',
  mid: 'openrouter/anthropic/claude-sonnet-4.6',
  strong: 'openrouter/anthropic/claude-opus-4.6',
} as const;
```

Model slugs on OpenRouter must be checked against `https://openrouter.ai/api/v1/models` before first use; if a slug is missing, change it here only.

| Agent | Tier | Tools | Trigger | Checkpoint | Runs in | Notes |
|---|---|---|---|---|---|---|
| **talk** | mid | all Cue tools, `read_graph`, `read_open`, `task` (delegates) | user-turn | commit-gate | local-node (cloud later) | The one conversation the user has. Owns the subagents below. |
| **observer** | none → cheap | `run_checks`, `run_tests`, `read_graph` | event (commit) / schedule | none | local-node / sandbox | Runs `checkInvariants` and `npm run observe`; writes `reality.json`. No model unless summarising. |
| **planner** | mid | `read_graph`, `read_open`, `stage` | event (observer finding) | auto-stage | local-node | `unrealised-to-tasks` and `next-decision`. Never commits. |
| **builder** | mid (strong for tasks flagged hard) | sandbox fs, `bash`, `git`, `run_tests`, `raise_question` | delegate (queued task) | commit-gate after full suite green | sandbox | Work order = task + rule lines + tests/conditions + provenance quotes (`scripts/dispatch.mjs`). |
| **reviewer** | strong, thinking high | read-only diff, `read_graph`, `run_tests`, `verdict` | event (suite green) | commit-gate (task `done → verified`) | sandbox / cloud | `review-change`: does the diff serve the rule's intent, or only the test? Verdict `serves-intent | overfits | unclear`. |
| **clarifier** | mid (= talk) | `raise_question`, `ask`, `answer` | delegate (blocked task) | clarify-block | browser via talk | Not a separate process: the escalation path from builder/reviewer into Talk's `ask`. |

Rules of thumb (settled in the literature and in Flue's own `subagents.md`): one agent with many tools when the tools form one coherent skill (Talk's Cue protocol); a separate subagent when a phase needs another model tier, another tool surface, or must not see the parent's context (builder, reviewer).

## 4. Checkpoints and blocking

- **Commit gate** is the proposal-object pattern: agents produce `stage` cues, the user approves. Same shape as LangGraph `interrupt()` before an approval node.
- **Clarify-block**: Flue has no interrupt primitive, but the submission queue plus `usePersistentState` gives one. The builder persists `{ waitingOn: followUpId }`, calls `raise_question` (task → `blocked`), and returns. When the user answers, Talk dispatches the answer to the builder's conversation id; the builder resumes from its transcript with the answer appended, no replay.
- **Ask vs act** (Horvitz): ask when exploration yields zero or several plausible readings, or when no measurable done-criterion can be derived from the rule lines and test conditions. A raised question names the subject nodes, what is missing, and the two or three readings considered.

## 5. Budgets, safety, audit

Wire these, do not invent them: `thinkingLevel` and model per subagent; `Agent.durability` for retries and wall time; `useSandbox` isolation for anything that writes files; tool allow-lists per `AgentSpec.tools`; `observe()` → every `tool`/`turn` event appended to the `AICall` log with cost, so the Reference scoreboard shows spend per agent version. Hard caps in `budget` are enforced in the agent function (count turns via persistent state; abort past `maxCostUsd`). Keys only from the environment (`.env`, gitignored): `OPENROUTER_API_KEY` is the one we need; `ANTHROPIC_API_KEY` is optional for direct calls.

## 6. Topology

**Now (prototype).** `npm run agent` = one Node process: the WebSocket relay on :5200 and the Flue runtime in-process (`start({ agents: [Talk] })`, sqlite persistence in `agent/.flue/*.sqlite`). Talk owns observer/planner as `useSubagent` delegates and runs builder/reviewer through its `dispatch_task` / `run_review` tools as their own conversations (`builder:<taskId>`, `reviewer:<taskId>`). Builder uses `local()` against a fresh `git worktree` of this repo; switch to E2B (free tier, Flue-verified adapter) the moment we want isolation. The browser stays on the bus protocol; the agent server is the bus's `agent` client. `observe()` logs to stdout and to the `AICall` log via the bus.

**Later (cloud).** Two equivalent paths, choose when needed:
- **Cloudflare**: agents as Durable Objects, state in Durable SQLite or Hyperdrive Postgres, builder/reviewer sandboxes on E2B or Cloudflare Sandbox, tracing via `createCloudflareTracing()`, schedules via Cron Triggers. Lowest ops.
- **Node on Fly/Render**: one long-lived server, Postgres for durable queues, E2B or Fly Machines for sandboxes, `observe()` → OpenTelemetry.
In both, the browser talks to the runtime with `@flue/sdk` over HTTPS and the relay disappears; the Cue protocol stays.

**Sandbox choice.** Prototype: `local()` on a worktree, then E2B (2–5 s start, per-instance persistence, env-injected keys, free tier). Later: E2B for short tasks, Fly Machines when a workspace must persist across hours.

## 7. The browser ↔ runtime seam (`runtime: 'flue'`)

`src/ai/runtime.ts::runAI` is the only caller of any AI function. Its `flue` branch must not know about Flue: it calls an `AIBackend` interface (`src/ai/backend.ts`: `run(fnId, prompt, contextText, inputText, outputSchema) → Promise<unknown>`) with two implementations — `StubBackend` (today's deterministic stubs, synchronous) and `BusBackend` (publishes `{ kind:'ai-request', id, fn, prompt, context, input }` on the bus and awaits `{ kind:'ai-response', id, output | error }`). On the agent server, `agent/ai-service.ts` answers those requests with `harness.prompt(text, { result: schema })` on a cheap/mid model chosen from the function's registry entry, so every registry function gets a real model with **the same prompt, the same declared context and the same `toCues`** as the stub. The `AICall` record gains the model id and cost from the `turn` event. Switching `state.aiRuntime` in the Reference page flips backends live.

Implementation facts (Stage 3, verified): the server runs each request as a one-shot `AiFunction` agent whose harness tool calls `harness.prompt(text, { result: schema })`; a Valibot schema is not JSON-serialisable, so it cannot ride Flue's durable `initialData` and travels through a module-level slot instead — which is only safe because `agent/ai-service.ts` drains requests **one at a time**. Give each request its own closure before adding concurrency. `FAKE_AI=1` answers the three smoke functions with canned, schema-valid output and never touches Flue, so the seam is tested in CI without a key. On timeout or schema failure the browser shows the stub result and marks the call `failed`; nothing blocks.

## 8. Decisions (v4.2)

- **Planner stays a Talk delegate.** No schedule trigger exists yet to justify its own conversation; revisit only when it needs one.
- **Reviewer precheck is rule-based, not a model call.** `agent/agents/precheck.ts::precheckDiff(changedFiles, codeRefs)` is a pure function: a changed file is in scope when it sits at or under the repo-relative path of at least one target's `props.codeRef`. `talk.ts::run_review` runs it before dispatching the reviewer — `git diff --name-only` in the worktree (`agent/agents/tools.ts::diffChangedFiles`, reusing the same allow-listed `repo diff` command) against the task's codeRefs. In scope (`scopeOk:true`) → the reviewer runs at **mid** tier; anything outside → **strong**. The tier is threaded in without changing `Reviewer()`'s signature: `run_review` sets the `TIER_OVERRIDE_REVIEWER` env var right before `init(Reviewer, ...)` and clears it after — `from-spec.ts::modelFor` checks `TIER_OVERRIDE_<SPEC_ID>` ahead of the spec's own `tier`. Once the reviewer calls `verdict`, `run_review` appends `{ verdict, reasons, at, scopeOk }` to `src/reality.json.verdicts[taskId]` itself (it already runs server-side) and publishes a `reality` bus message the browser does not yet handle.
- **The task lifecycle gate reads that verdict.** `checks.ts` raises `task-done-without-verdict` (question) when a task is `done`/`verified` with no verdict recorded, and `task-verified-without-green` (task) when a task is `verified` but not every targeted test is pass-and-fresh — `store.ts::applyReality` sets `props.verdict` and moves `done → verified`/`blocked` before `checkInvariants` runs, so both checks read the merged graph, never `reality.json` directly.
- **Cloud path deferred.** Cloudflare vs. Node stays undecided until the first non-local user appears; nothing here depends on the choice yet.
