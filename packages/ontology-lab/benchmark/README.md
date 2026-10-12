# Ontology usefulness benchmark

This evaluates the unchanged local authoring pipeline against familiar app ideas.
It measures technical completion separately from useful understanding. All inputs
are synthetic. Production prompts and rules stay fixed during a baseline run.

## Protocol

- Eight app conversations cover tasks, expenses, booking, habits, shared groceries,
  a private journal, a calendar assistant and an underspecified book catalogue.
- Expected facts, exclusions and useful question topics are written in `cases.mjs`
  before calling a model. Two runs per conversation expose some variability.
  The 14 fixture checkpoints are rubric sections; they are not 14 independent apps.
- Follow-up conversations include prewritten assistant questions and user replies.
  This tests context retention, not a fully adaptive conversation or user study.
- Calls use the production Codex provider, mapper, question planner and real
  Rust/Wasm readiness evaluator. Private benchmark runners share one isolated
  Worker; they do not modify the user's local World or occupy the UI's runner.
- Save the commit, source hashes, case hash, CLI version, exact inputs, raw proposal,
  events, findings, visible questions, elapsed time and failed attempts. The current
  production Codex provider does not return resolved model identity or token usage;
  those remain unknown. No silent retries or discarded failures.
- Regex matches are review aids only. They exclude source quotes and questions.
  Negated forbidden terms may correctly express an exclusion, so flags are never
  automatically counted as invented features.

## Semantic review rubric (frozen before reading outputs)

Review each run against its input and prewritten expectations:

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Fidelity | Material invented fact, wrong permission, ignored correction or contradiction presented as settled | Material interpretation remains ambiguous or an unsupported proposal looks settled | Stated intent and restrictions are preserved; proposals and uncertainty are clear |
| Coverage | Core requested workflow missing | Core flow present, but at least one important stated requirement missing | All prewritten key facts are represented with their meaning intact |
| First-question usefulness | Redundant, irrelevant or based on a false premise | Reasonable but generic, lower priority or needlessly broad | Concrete unresolved question that materially advances this app's definition |
| Context and restraint | Reopens an explicit exclusion/answer or overbuilds an underspecified request | Some unnecessary questioning or assumptions | Respects answered questions, scope corrections and deliberate ambiguity |

Record evidence and per-fact preserved/partial/missing judgments rather than only
a combined score. These are assistant-reviewed rubric judgments, not human user
ratings or a calibrated measure of intelligence. A valid draft and `ready` graph
do not prove meaningful requirements, useful questions or a working application.

## Running

From the repository root after `npm run build`:

```sh
node --test packages/ontology-lab/benchmark/*.test.mjs
node packages/ontology-lab/benchmark/pipeline.mjs --live --repeat 2 --concurrency 2 --out .test-artifacts/ontology-benchmark-baseline
node packages/ontology-lab/benchmark/graph-probes.mjs
```

Live Codex runs use the locally signed-in CLI and require loopback networking.
`--cases id,id` selects conversations, `--port` changes the default Worker port
8797, and `--out` must identify a new experiment directory. Raw outputs stay in
ignored `.test-artifacts`; results must include failures and remaining uncertainty.

The separate System One benchmark tests narrow semantic judgments with labels
fixed before API calls. It does not imply that System One is integrated into the
production authoring pipeline. Thresholds are experimental and require larger,
held-out evaluation before they govern automatic actions.

## Baseline findings — 2026-10-09

Measured against production commit `0a40d35d648a377de6912958b4ae7c715321190c`,
Codex CLI `0.161.0` using its default model, and TypeSafe `jev-1.13.0`.
The two-run-per-idea Codex baseline completed 16/16 runs; all graph evaluations
were `unknown`. Median elapsed time was about 22 seconds per run with two lanes
(the harness reports the upper median). This is a fixture result, not a reliability SLA.

Durable synthetic proposals, questions, rubric scores and aggregate model evidence
are in [results-2026-10-09.json](results-2026-10-09.json). An independent, non-blind
model-assisted review rated 58 of 60 expected fact instances fully represented and
two partially formalized. Those two preserve the requested `/health` behavior but
leave the test procedure undefined; they are not lost user facts. No material
invented requirements or ignored scope corrections were found in these 16 runs.

Only 1/16 visible first questions received the top rubric rating (concrete and
consequential); 14 were reasonable but generic, and one re-asked the already stated
Friday review cadence. This is a subjective rubric count, not an accuracy score.

The major observed defect is question prioritization. For the booking app, Codex
generated “Does a pending request hold the slot, or can several members request it
until you approve one?” The visible first question was instead “For «Room bookings
never overlap», what would count as success, and when would you review it?” The
private journal was asked which changes needed approval for a search operation.
The fixed planner prioritizes generic graph obligations and can discard concrete
model questions when it takes the first three cards.

The native Rust and actual Worker/Wasm graph probes matched on all ten inputs:
valid structure passes; missing complete/incomplete edges, cycles and named
constraint conflicts produce their expected findings. Four semantic counterexamples
remain `ready`: an irrelevant indicator, conflicting authorization prose, mismatched
operation/permission scope and an unrelated assay. A fifth false-entailment example
passes exact-quote validation and receives only unrelated structural findings.
This proves a coverage limit, not a malfunction in the inference engine. Ascent
currently computes dependency closure/cycles; most graph checks are regular Rust.

### System One measurements

The 36 prelabelled microcases have six dimensions with six cases each, repeated
three times. Thirty cases have comparatively crisp labels; six question-usefulness
labels reflect an authored rubric. Expected labels and rationales were never sent
to the API. All 108 calls completed on `jev-1.13.0`, and the p ≥ 0.5 classifications
agreed with all 36 case labels in all three repeats. With the predeclared p ≤ 0.1 /
p ≥ 0.9 bands, 93/108 judgments were accepted and 15 abstained, with zero accepted
errors. That is 31/36 distinct cases accepted, not 93 independent examples.

| Judgment | Accepted at conservative bands | Errors among accepted |
| --- | --- | --- |
| Evidence support | 15/18 | 0 |
| Explicit correction versus unresolved choice | 18/18 | 0 |
| Permission scope | 15/18 | 0 |
| Indicator relevance | 15/18 | 0 |
| Question already answered | 18/18 | 0 |
| Question usefulness | 12/18 | 0 |

Mean API latency was 192 ms per microcase. Recorded usage was 41,166 input tokens;
the [documented input price](https://docs.typesafe.ai/models) gives an estimate of
$0.00173 for this microbenchmark, not an invoice. Fixture Brier score was 0.00419.
These small, balanced, mostly straightforward cases and tailored questions do not
establish probability calibration, general intelligence, or production error rates.

A separate shadow experiment scored 79 candidate questions from the 16 actual
pipeline runs (one usefulness Score and one already-answered Noul per candidate).
Sixteen batched API calls completed, taking about 211 ms per run on average and
46,366 input tokens (estimated $0.00195). It used role-aware messages and compact
drafts, with no expected labels or reviewer scores. It changed only an offline
selection; production question behavior is unchanged. The p ≥ 0.9 duplicate gate
excluded no candidates (maximum p was 0.69), so duplicate prevention is not proven.

The reviewer froze baseline ratings before examining shadow selections, then used
the same rubric. Shadow ranking improved 13/16 selections, tied three and worsened
none; 13/16 selected questions received the top rating, versus 1/16 in the current
UI. The remaining three were broad grocery/approval prompts. This is encouraging
evidence for ranking existing candidates, not proof of user satisfaction or that
the model can supply a good question when none was generated. Reviewer judgments
were non-blind and model-assisted, with no human participant study.

### What we can depend on

- Use Rust/Ascent to enforce specified structural invariants and propagate qualified
  facts. A rule is only as meaningful as its inputs and the obligations it covers.
- System One is promising for narrow evidence, correction and relevance judgments,
  with uncertainty recorded and unresolved cases escalated. It is not yet integrated
  as a semantic validator of these graph proposals. The microcases do not prove it
  catches the exact graph counterexamples.
- Question ranking can use semantic judgments, but a high score does not establish
  the best next question. Relevance depends on the current authoring stage, which
  decisions are already settled and the alternatives supplied to the ranker.
- Keep exact arithmetic, dates, typed authorization enforcement and execution in
  code. [Jev’s documented limits](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
  include numbers, date comparisons, indirection and adversarial/irrelevant context.
  [Confidence](https://docs.typesafe.ai/confidence) describes the answer distribution;
  thresholds require evaluation on the actual domain and consequences.

Recommended next work: make graph obligations appropriate to the app and authoring
stage; rank specific candidate questions while checking answered information; add
source-entailment, semantic edge relevance and contradiction review as explicit
versioned judgments; then evaluate on held-out descriptions, realistic multi-turn
conversations, adversarial inputs and user-rated question usefulness. This benchmark
is an assessment and reusable harness, not acceptance of unattended authoring.

### Reproduce System One and shadow ranking

```sh
npm run benchmark:system-one -- --live --env-file /path/to/authorized.env --output-dir .test-artifacts/system-one-new
node packages/ontology-lab/benchmark/question-ranking.mjs --live --env-file /path/to/authorized.env --input .test-artifacts/ontology-benchmark-baseline --output .test-artifacts/question-ranking-new.json
```

Only the `TYPESAFE_API_KEY` field is read from the authorized env file. Keys are not
copied into this repository or recorded with results. Re-running uses new output
paths to preserve evidence. Full synthetic traces and proposals for this run are in
`.test-artifacts/ontology-benchmark-baseline`; raw System One evidence is in
`.test-artifacts/system-one-benchmark`.

## Local integration follow-up (2026-10-09)

[Durable results](results-2026-10-09-improvements.json) include source manifests, per-case independent model-assisted ratings, exact graph judgments and offline selection comparisons. The original baseline above is unchanged. Jev 1.13.0 now supplies six provisional graph/question judgments in the local lab; gpt-6-luna generates questions tied to current findings. Human ratings: **zero**.

| Measurement | Live original baseline | Live revised baseline | Live frozen held-out | Final policy offline reselection |
| --- | --- | --- | --- | --- |
| Completed | 16/16 (8 ideas × 2) | 8/8 (one each) | 33/33 distinct conversations | Same saved 8 + 33 outputs |
| Top-rated first questions | 1/16 | 6/8 | 19/33 | 8/8 baseline; 19/33 held-out |
| Question rubric points | See original results | 13/16 | 48/66 | 16/16 baseline; 49/66 held-out |

The independent review was nonblind and model-assisted. Held-out fidelity and coverage scored 66/66 each; this rubric is not a proof of semantic correctness. Revised baseline fidelity and coverage each scored 15/16: an expense beneficiary was misframed, and the calendar health criterion lacked full typed Assay coverage despite preserving the fact. Reselection reused identical proposals/judgments, changed 3/8 baseline and 8/33 held-out questions, and is **not a live rerun**. Its mixed held-out changes do not establish robust uplift. The proposed 80% useful-question target remains unmet. Known errors include suggesting excluded packing recommendations, reopening closed ballots, moving request approval to listing approval, and generic success prompts.

Final exact graph review flagged all five bad graphs and had zero flags on the valid control; valid-control permission meaning remained uncertain. Thresholds stayed at 0.1/0.9. Earlier experiments exposed stale prompt paths and duplicated context; their raw results remain in `.test-artifacts/semantic-graph-review*.json` and `ontology-heldout-v2`. These known synthetic probes are neither calibration nor general reliability evidence.

| Phase | Held-out p50 | Held-out p95 |
| --- | ---: | ---: |
| Extraction | 17.690s | 32.677s |
| Rust | 0.006s | 0.025s |
| Graph semantic review | 0.534s | 0.999s |
| Luna questions | 4.125s | 6.560s |
| Question ranking | 0.393s | 0.552s |
| Total | 23.982s | 38.286s |

Extraction is the main latency bottleneck. More semantic calls are inexpensive in elapsed time here but do not guarantee useful questions. The next work should address exact exclusions/permission subjects and generic fallback selection, then obtain human ratings before autonomy. An additional live local-app adaptive follow-up respected a short no-metrics answer and asked a different access-scope question; that single synthetic interaction is not a broad adaptive benchmark.

Reproduction (explicit live calls use an authorized local env file):

```sh
node packages/ontology-lab/benchmark/heldout-evaluation.mjs --live --env-file /path/to/authorized.env --repeat 1 --concurrency 2 --out .test-artifacts/ontology-heldout-new
node packages/ontology-lab/benchmark/reselect.mjs --input .test-artifacts/ontology-heldout-new --out .test-artifacts/ontology-reselected-new
```

Use `BROPILOT_SEMANTIC_REVIEW=off` or `BROPILOT_QUESTION_MODEL=off` to disable optional local providers. Provider requests contain the bounded role-aware conversation and relevant graph subject; request count/bytes/concurrency/deadlines are bounded, while observed token guards cannot undo already-running calls. No semantic result updates canonical state, authorization or Assay execution evidence.
