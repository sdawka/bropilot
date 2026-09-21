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
- **Tiers are subagents.** `useSubagent` adds a `task` tool; the parent model delegates by name. The child runs in a fresh context (inherits sandbox + workspace only, never the parent's history or tools), may use a different model and thinking level, runs in parallel with siblings, depth ≤ 4, and resumes from its own durable transcript after a crash. `defineSubagent()` makes a reusable definition. This is the mechanism for cheap → mid → strong routing.
- **Per-turn model choice.** `useModel` runs on every render, so an agent can escalate mid-conversation by reading `usePersistentState`. Tool subsets are just conditional `useTool` calls; the runtime tells the model when tools appear or disappear.
- **Durability.** Every submission is recorded before work starts and owes one terminal outcome (`completed | failed | aborted`); default 10 attempts, 1 h timeout, overridable per agent (`Agent.durability = { maxAttempts, timeoutMs }`). Persistence adapters: in-memory (default), `sqlite(path)`, custom; a DB adapter (Postgres) coordinates replicas. Sessions resume with `init(Agent, { id })`. One live owner per conversation; you cannot dispatch from one process and read the in-flight stream from another. (`guide/durability.md`)
- **Observability.** `observe(cb)` streams every event with correlation ids (`agentName, conversationId, submissionId, turnId, taskId`): `submission_settled` is the reliable terminal signal; `turn` carries `response.usage` (input, output, cache read/write, cost); `tool_start/tool`, `task_start/task`, `log`, `compaction`. This is where `AICall` records and budgets come from. (`guide/observability.md`)
- **Structured output** only on tools (`defineTool({ output: v.object(...) })`) and on `harness.prompt(text, { result: schema })`; the top-level reply is text. So every result we care about is returned through a tool, never parsed from prose.
- **Sandboxes.** `bash()` = in-memory emulated Linux (just-bash), rebuilt per message, good for data work; `local()` = host fs + shell, no isolation; remote adapters via `flue add sandbox <provider>` for **E2B, Daytona, Modal, Cloudflare Sandbox, Cloudflare Computer**, lazily created per agent instance and reconnected for durability. (`guide/sandbox*.md`, `ecosystem/`)
- **Deployment.** `vite build` with `@flue/vite` → `dist/server.mjs` standalone Node HTTP server, or Cloudflare Workers where each agent is a Durable Object. Clients use `@flue/sdk` `createFlueClient({ url, token })` against `https://host/agents/<path>/<conversation-id>`; streaming is HTTP GET with backoff; auth is bearer/headers, application-defined. No hosted Flue service, no agent registry, no agent-to-agent network calls. (`cli/`, `sdk/`, `ecosystem/cloudflare.md`)
- **Providers.** `'provider/model-id'` specifiers over anthropic, openai, google, bedrock, vertex, groq, mistral, openrouter, cloudflare (Workers AI, no key)…; keys from the environment only; custom providers via `setProvider(createProvider(...))`; no built-in fallback (the agent function decides).

## 3. The agents

Declared once in `src/agents.ts` as `AGENTS: AgentSpec[]` (Node-runnable, explicit `.ts` imports, provenance on every entry), rendered on the Reference page and emitted to `docs/AGENTS.md`. `agent/agents/<id>.ts` implements each one as a Flue function whose hooks are driven by the spec, so the spec is the single source of truth for model, tools, budget and checkpoint.

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

**Now (prototype).** `npm run agent` = one Node process: the WebSocket relay on :5200 and the Flue runtime in-process (`start({ agents: [Talk] })`, sqlite persistence in `agent/.flue/*.sqlite`). Talk owns observer/planner/builder/reviewer as `useSubagent` delegates. Builder uses `local()` against a fresh `git worktree` of this repo; switch to E2B (free tier, Flue-verified adapter) the moment we want isolation. The browser stays on the bus protocol; the agent server is the bus's `agent` client. `observe()` logs to stdout and to the `AICall` log via the bus.

**Later (cloud).** Two equivalent paths, choose when needed:
- **Cloudflare**: agents as Durable Objects, state in Durable SQLite or Hyperdrive Postgres, builder/reviewer sandboxes on E2B or Cloudflare Sandbox, tracing via `createCloudflareTracing()`, schedules via Cron Triggers. Lowest ops.
- **Node on Fly/Render**: one long-lived server, Postgres for durable queues, E2B or Fly Machines for sandboxes, `observe()` → OpenTelemetry.
In both, the browser talks to the runtime with `@flue/sdk` over HTTPS and the relay disappears; the Cue protocol stays.

**Sandbox choice.** Prototype: `local()` on a worktree, then E2B (2–5 s start, per-instance persistence, env-injected keys, free tier). Later: E2B for short tasks, Fly Machines when a workspace must persist across hours.

## 7. The browser ↔ runtime seam (`runtime: 'flue'`)

`src/ai/runtime.ts::runAI` is the only caller of any AI function. Its `flue` branch must not know about Flue: it calls an `AIBackend` interface (`src/ai/backend.ts`: `run(fnId, prompt, contextText, inputText, outputSchema) → Promise<unknown>`) with two implementations — `StubBackend` (today's deterministic stubs, synchronous) and `BusBackend` (publishes `{ kind:'ai-request', id, fn, prompt, context, input }` on the bus and awaits `{ kind:'ai-response', id, output | error }`). On the agent server, `agent/ai-service.ts` answers those requests with `harness.prompt(text, { result: schema })` on a cheap/mid model chosen from the function's registry entry, so every registry function gets a real model with **the same prompt, the same declared context and the same `toCues`** as the stub. The `AICall` record gains the model id and cost from the `turn` event. Switching `state.aiRuntime` in the Reference page flips backends live.

## 8. Open questions

- Whether planner deserves its own conversation or stays a Talk delegate (leaning delegate until it needs a schedule).
- How much of the reviewer's verdict can be rule-based before a model is needed (diff touches only files named by the test's `codeRef` → cheap tier suffices?).
- Cloud path: Cloudflare vs Node. Decide when the first non-local user appears.
