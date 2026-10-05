# System One for the uip: Clef research and decision proposal (2026-10-04)

## Part 1. What Clef is

Clef is not a TypeSafe model. It is **Cloudflare's** own System One ("decision") model family, released 2026-10-01 by the Workers AI team. It speaks the same request/answer format as TypeSafe's Jev, so Jev code works with a model-id change.

| | Clef | Clef-flash | Jev (current LFP) |
|---|---|---|---|
| Size / base | 27B, Qwen3.8-27B (multimodal) | 9B, Qwen3.5-9B | proprietary |
| Workers AI id | `@cf/cloudflare/clef` | `@cf/cloudflare/clef-flash` | n/a |
| OpenRouter id | `cloudflare/clef` | `cloudflare/clef-flash` | `typesafe/jev-1.13` |
| Input price / M tokens | $0.24 | $0.09 | $0.042 |
| Median latency (Cloudflare) | 209 ms (p95 239) | 38.8 ms (p95 122) | 524 ms |
| Latency measured by a third party over REST from Italy, 395 tokens | 524-726 ms | 191-205 ms | not measured |
| Context | 65,536 tokens | 65,536 | 64k state+questions, 32k state+longest question (LFP docs) |

- **Question types:** `noul`, `choice`, `score`, identical to Jev. Output tokens are not billed.
- **Limits:** up to 64 questions and 4 images (4 MiB each, base64 PNG/JPEG/WebP) per request.
- **Different from Jev:** open weights (Apache 2.0, HF `Cloudflare/clef`, `Cloudflare/clef-flash`), vision/video input (Jev is text only), faster tiers, hosted at the edge. Cloudflare claims first place on 7 of 10 decision benchmarks, ranking highest on TypeSafe's own Jev Decision Index. Vendor claim, not verified here.
- **GA:** the Cloudflare blog says "Generally Available". Jev 1.13 is early access per the LFP docs.
- **Free tier:** 10,000 Neurons per day (about 458K Clef or 1.2M Clef-flash tokens).

### How to select it
1. **Workers AI binding** (best for a Worker, no key at all):
   `const { answers } = await env.AI.run('@cf/cloudflare/clef-flash', { model: 'clef-flash', state, questions })`. The binding returns Jev-shaped `answers` unwrapped.
2. **Workers AI REST:** `POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/ai/run/@cf/cloudflare/clef-flash`, bearer token, body `{model, state, questions}`. Answers sit under `result` in the usual `success/errors/messages` envelope.
3. **TypeSafe SDK:** Cloudflare says "TypeSafe SDK" works and "fully compatible with Jev's API". I did not find the documented base URL for it. Unverified: point `TypeSafeClient({ baseURL, defaultModel: 'clef' })` at a Clef server.
4. **OpenRouter:** both models are listed at https://openrouter.ai/cloudflare. **Not verified:** whether OpenRouter serves them on `/api/v1/systemone` (the route the LFP uses for Jev) or only chat completions. Test with one curl before relying on it.
5. AI Gateway is compatible, which is useful for logging and caching decisions.
- **Not found:** TypeSafe's docs (docs.typesafe.ai, `llms.txt`) mention only Jev 1.13 and `jev-latest`, and npm `@typesafe-ai/sdk` (latest 0.6.0, 2026-09-15) has no Clef mention. Pricing and limits pages are absent from the doc index. Also note an Ollama build exists (`ollama.com/library/clef`) and another open family, Kev, uses the same format.

Sources: https://blog.cloudflare.com/clef-decision-models/ , https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/ , https://developers.cloudflare.com/workers-ai/models/clef/ , https://huggingface.co/Cloudflare/clef , https://flaviocopes.com/clef/ , https://openrouter.ai/cloudflare , https://www.marktechpost.com/2026/10/01/cloudflare-releases-clef-and-clef-flash/ , https://docs.typesafe.ai/concepts/system-one , https://github.com/MemberJunction/MJ/pull/4983 , https://registry.npmjs.org/@typesafe-ai/sdk

## Part 2. The LFP contract (from `lfp/src/ai/*`, `lfp/agent/system1*.ts`, AGENT-RUNTIME.md section 9)

**Request:** `{ state, questions: Record<id, S1Question> }`. `state` is any text/JSON the questions read. Question shapes:
- `{ type:'noul', instructions, criteria?: { true?, false? } }` where a criterion is a string or `{ definition, examples[] }`.
- `{ type:'choice', instructions, criteria: Record<optionKey, description> }`.
- `{ type:'score', instructions, criteria: string[] }` ordered low to high.

**Answers:** `Record<id, …>`:
- noul: `{ type, noul: p }`, confidence is `|p-0.5|*2`.
- choice: `{ type, choice, confidence, probabilities }`.
- score: `{ type, score: index, confidence, probabilities }`.
Whole-call confidence is the weakest answer (`minConfidence`); a spec may override (mean, per-answer gating).

**Thresholds** (`decisionConfig.ts`): default .70; route-utterance .70, find-by-title .65, duplicate-detect .80, review-change .80, ask-or-act .85 (strictest), condition-match .85, link-answer (choice) .60, link-answer-pair (noul) .55. A noul threshold does not carry over to a choice. Below threshold, timeout or error, code falls back to the deterministic stub, so a fallback is never a failure. Tune from logged runtime/confidence columns, not by feel.

**Chain and fan-out** (`ontology.ts`, `system1.ts`):
- Question tree layer -> space -> kind -> node. Code walks it; the model never sees the tree.
- Option sets are small and homogeneous, one ontology level per question, and each option is grounded with example titles ("Kind: blurb, e.g. "A", "B""). Singular kinds (name/purpose/summary) are excluded because they became the sink for vague text. Always include a `none` option.
- All sibling questions go in one request (parallel pass, free output), only the chosen branch is read.
- Dependent levels cost a round trip each, capped at 4 (`decideGated`).
- **Fan-out:** when level 2 depends only on level 1's choice, ask level 1 plus every branch (`node-<kind>`) in one request if it fits the budget (state + all questions <= 64k tokens, state + longest <= 32k; tokens ~ JSON chars / 4). Seed graph: 39-40 questions, about 7.6k tokens. **Clef's cap of 64 questions per request is a new constraint** that the LFP did not have to model, so cap fan-out at 64 questions.
- State shaping: send only literal strings the question needs, never the graph or transcript; code pre-filters candidates and Jev picks. Wording must be what the code means ("one combined question the user answers in one reply" scored 0.86; "one sentence resolves both" failed).
- Measured on Jev: kind -> node with examples 17/20 (mean conf .77); flat 11-way choice 25/42 vs space-first 34/42.

**Server seam:** the key lives server-side; browser publishes `system1-request {id, fn, state, questions}`, server answers `system1-response {id, answers|error, model, ms, usage}`; only `agent/system1.ts` imports the SDK; `FAKE_S1=1` serves canned answers (the `#s1no` / `#s1low` tokens drive both gate branches). Per-attempt timeout 2.5 s with one retry; browser cut-off 6 s per level.

## Part 3. Recommendation for the uip

**Model:** default to **`@cf/cloudflare/clef-flash`** via the Workers AI binding, because the uip is hosted on Cloudflare. It needs no extra key, is 38 ms median, and costs $0.09 per M. Use **`clef`** (27B) for the few decisions that must be right (proposal vs question, edge choice). Keep Jev over OpenRouter as a configuration fallback behind the same seam: swap `askSystem1` for a function that takes `{provider, model}`. Note the Clef-flash 9B is smaller than Jev's reported quality tier, so re-run the LFP's `s1:eval` style check (20 labelled phrases) against the uip's seed ontology before trusting thresholds.

**Seam shape:** one Worker route `POST /api/s1 { fn, state, questions } -> { answers, model, ms }` calling `env.AI.run`. Reuse the LFP `S1Question`/`S1Answers` types, `answerConfidence`, `minConfidence` and fallback-never-fails rule unchanged. The sidebar always has a code-only fallback (substring match + current lens).

**Typed decisions** (each: state, questions, notes). Start thresholds at LFP values and tune.

1. **utterance-act** (gate for everything). State `{ text, current: { lens, node?title } }`. One `choice` `act`: `navigate` (go to or show something), `ask` (a question about the graph), `change` (propose an edit), `chitchat/none`. Use `clef`. Threshold .75. `change` is never applied silently; it always becomes a staged proposal.
2. **lens-pick** (which traversal perspective). State `{ text }`. One `choice` over `user | domain | intent | delivery`, each criterion carries the path ("audience -> use case -> flow -> screen"). 4 options, fan-out safe. Threshold .65. Falls back to the current lens.
3. **space-kind-pick** (what kind of thing is meant). Sibling request: `space` choice over the 7 spaces plus `kind-<space>` choices (options with 3 example titles, singular kinds excluded). Resolve via `resolveSpaceKind`. About 8 questions.
4. **node-pick** (which node). Reuse `nodeByTextFanoutRequest`: candidates (substring) + kind + `node-<kind>` fan-out, `none` always present, cap 40 nodes per kind and 64 questions total. Ends in navigation to the node. Threshold .65 (confident candidate ends the chain).
5. **project-pick** (project list screen and cross-project chat). State `{ text }`, one `choice` over project names with a one-line summary each, plus `none`. Under 10 options, one round trip.
6. **level-pick** (zoom). Given a node's kind level, one `choice` of `up | stay | down | sideways` plus a `score` for "how broad is the question" (specific / module-wide / system-wide) over C4 level 1-3. Drives which level the canvas opens at.
7. **edge-pick** (which of the node's edges answer the question). State `{ text, node: title/kind }`. One `noul` per neighbouring edge (`Does the question ask about "<type> -> <title>"?`) with structured true/false criteria, as LFP link-answer-pair does; cap at 40 neighbours. Show the top neighbours as chips. Threshold .55 on `|p-.5|*2`; uncertain ones are offered to the user, never dropped silently.
8. **answerable-from-graph** (grounding gate before the chat agent answers). State `{ text, node/neighbour titles }`. `noul`: "Can this be answered from the listed nodes alone?". A confident no routes to a "this is not in the graph, add it?" proposal instead of an invented answer.
9. **change-target** (for `change` acts). Chain: `edit-vs-new` noul/choice (`edit | new | none`), then `kind` choice for new nodes, then `node` choice for edits. Each level one round trip, or fan-out when it fits. Threshold .70 (edit-vs-new in LFP).
10. **proposal-risk** (review tier for a staged change). One `score` over `routine | notable | structural | breaking`, state is counts and kinds touched, never the diff. Strict .80. Drives whether the sidebar asks for confirmation.

**Ordering in the sidebar:** run 1 and 2 together (siblings, one request: 5-6 questions), then branch: navigate -> 3/4 (fan-out, one trip), ask -> 7 and 8 together, change -> 9 then 10. A typical turn is 1 to 2 round trips at about 40-250 ms each on clef-flash.

**Open items for the lead:**
- Verify (one curl each) whether OpenRouter `cloudflare/clef-flash` accepts `/api/v1/systemone`, and the TypeSafe SDK's base URL for Clef. The Workers AI binding makes both unnecessary if the uip runs on a Worker.
- Per-request cap of 64 questions; images are allowed, so a later "what is on this screenshot" decision could use Clef's vision.
