# TypeDB as the uip ontology store: research and verdict (2026-10-05)

Legend: [V] verified from a fetched source, [U] unverified or inferred, [X] not executed (no TypeDB server was run; all TypeQL below is untested).

## 1. TypeDB as of October 2026

- **Version**: 3.x line. 3.13.6 released 2026-09-22 [V] https://github.com/typedb/typedb/releases/tag/3.13.6 ; 3.13.0 on 2026-09-08 per https://en.wikipedia.org/wiki/TypeDB . 3.0 (Dec 2024) was a full Rust rewrite of the Java 2.x server [V] https://typedb.com/blog/typedb-3-0-is-now-live
- **Licence**: Community Edition is MPL-2.0 [V, via search summary of GitHub/Wikipedia]. Drivers are Apache-2.0 [V, npm]. Enterprise and Cloud are commercial.
- **Editions**: Community (local server binary/Docker), Enterprise (self-run, clustered), Cloud (managed) [V] https://typedb.com/docs/home/
- **Pricing** [V] https://typedb.com/pricing : Cloud "Explore" free forever (1 server, 10 GB, 2 vCPU, 8 GB RAM); "Launch" from $0.07/hour (up to 7 servers, 1 TB); Enterprise custom.
- **Embedded**: I found no in-process/embedded mode. It is a server (Rust binary) with a gRPC port and an HTTP port (8000) [V for HTTP; U for "no embedded"].
- **Type system** [V unless noted] https://typedb.com/docs/reference/typedb-2-vs-3/diff/ , https://typedb.com/docs/typeql-reference/annotations/
  - `entity`, `relation`, `attribute` types; `sub` subtyping; `@abstract`.
  - Relations declare roles with `relates`; types join with `plays rel:role`; attributes via `owns`.
  - Annotations: `@card(a..b)` on `owns`/`relates`/`plays` (defaults: plays 0.., owns and relates 0..1), `@key`, `@unique`, `@subkey`, `@values`, `@range`, `@regex`, `@distinct`, `@cascade`, `@independent`, `@doc`.
  - Role specialisation across a relation hierarchy (`relates x as y`) exists in TypeQL 3 [U on exact syntax].
- **Inference**: 3.x has **no rules**. Rules were deleted and replaced by typed, callable, recursive **functions** that must be invoked explicitly [V] https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/ . Example from the docs:
  ```
  fun reachable_from($from: node) -> { node }:
  match { edge (from_: $from, to: $to); } or { let $via in reachable_from($from); edge (from_: $via, to: $to); };
  return { $to };
  ```
  Newer releases add namespaced std functions (`std::math::round`) [V 3.13.6 notes].
- **Constraint timing** [U, important]: cardinality and key constraints are validated by the database at transaction commit; a violating write is rejected. I did not confirm exact commit-time semantics for lower bounds (`@card(1..)`) on `plays`; the 3.13.6 notes mention a batched "cardinality validation algorithm" which implies it is a commit-time scan [V that it exists, U on semantics].
- **Drivers** [V] https://typedb.com/docs/home/install/drivers/ : gRPC drivers for Python, Java, Rust, C, C#; a **TypeScript HTTP driver**. There is no gRPC driver for TypeScript.
  - npm `@typedb/driver-http` 3.13.6, Apache-2.0 [V, `npm view`]. The older `typedb-driver-http` (3.5.5) is stale; use the scoped name.
  - HTTP API: `POST /v1/signin` (JWT), `POST /v1/query` one-shot, or open/commit transactions; read/write/schema transaction types; available in all editions, default port 8000 [V] https://typedb.com/docs/reference/typedb-http-api/
  - The docs say the HTTP driver works in "Node.js, browser environments, and edge runtimes" [V as a docs claim; X not tested from a Worker]. Plain `fetch` plus JWT makes a Worker client plausible. A Worker cannot host TypeDB; it can only call a reachable server (Cloud, or a self-hosted box) [U on Cloud public-endpoint and TLS details].

## 2. This ontology, in TypeQL 3 (untested [X])

Source shapes: `kernel.ts` KINDS (id, space, level, `needs`), EDGE_TYPES (from/to kind lists), RELATIONS (`need` rows). Graph today: 243 nodes, 448 edges (`lfp/src/graph.json`, 142 KB).

### 2.1 Schema slice

```typeql
define
  attribute nid, value string;                        # node id
  attribute title, value string;
  attribute description, value string;
  attribute space, value string @values("basics","problem","hypothesis","solution","current","planned","effects");
  attribute level, value integer @range(1..3);
  attribute verdict, value string @values("open","supported","refuted","mixed");
  attribute ladder, value string @values("exists","surface","simulation");
  attribute result_source, value string @values("code","metric","manual");

  entity node @abstract,
    owns nid @key,
    owns title @card(1..1),
    owns description,
    owns space @card(1..1);                           # could instead be one abstract subtype per space

  entity audience sub node, owns level;               # level only where kernel.ts has one
  entity usecase sub node;
  entity problem sub node;
  entity outcome sub node;
  entity capability sub node;
  entity feature sub node;
  entity flow sub node;
  entity screen sub node;
  entity module sub node, owns level;
  entity interface sub node, owns level;
  entity rule sub node, owns level;
  entity test sub node, owns level, owns ladder, owns result_source;

  # Edge types: one relation per edge id, roles encode from/to by who plays them.
  relation edge @abstract, relates source, relates target, owns nid @key;

  relation has        sub edge, relates source as source, relates target as target;
  relation satisfies  sub edge, relates source as source, relates target as target;
  relation implements sub edge, relates source as source, relates target as target;
  relation exposes    sub edge, relates source as source, relates target as target;
  relation verifies   sub edge, relates source as source, relates target as target;
  relation governs    sub edge, relates source as source, relates target as target;
  relation monitors   sub edge, relates source as source, relates target as target;
  relation realises   sub edge, relates source as source, relates target as target;

  # EDGE_TYPES.from / .to become plays declarations (subtyping inherits them):
  capability plays satisfies:source;   feature plays satisfies:source;
  problem    plays satisfies:target;   usecase plays satisfies:target;
  agent      plays implements:source;  flow plays implements:source;  screen plays implements:source;
  capability plays implements:target;  feature plays implements:target;
  module     plays exposes:source;     interface plays exposes:target;   screen plays exposes:target;
  test       plays verifies:source;    rule plays verifies:target;
  rule       plays governs:source;     thing plays governs:target;
  metric     plays monitors:source;    outcome plays monitors:target;
  codebase   plays realises:source;    module plays realises:target;
```

- **Kinds as subtypes of `node`** works cleanly. `space` as an attribute is simplest; per-space abstract supertypes would need multiple inheritance, which TypeDB does not have [U], so use the attribute.
- **Edge shape** (`inv-edge-shape`) becomes a schema fact: inserting `satisfies(source: $feature, target: $outcome)` is rejected. Kernel `from: []` (unconstrained) edges would need an abstract `any` role-player set.
- **`needs` as `@card`**: possible (`rule plays verifies:target @card(1..)`), but see 4.2: a schema-enforced lower bound rejects the commit that creates a rule before its test exists. That contradicts `inv-meta-tests-raise-questions` (violations raise questions, never block).

### 2.2 Violations as functions

```typeql
# rule without a verifying test (inv-rule-has-test, needs verifies <- test)
fun rules_without_test() -> { rule }:
match $r isa rule; not { $t isa test; verifies (source: $t, target: $r); };
return { $r };

# module exposes nothing (needs exposes -> interface)
fun modules_exposing_nothing() -> { module }:
match $m isa module; not { $i isa interface; exposes (source: $m, target: $i); };
return { $m };

# orphan: a node in no edge at all
fun orphans() -> { node }:
match $n isa node; not { $e isa edge; $e links ($n); };
return { $n };

# test without a rule (inv-test-has-rule)
fun tests_without_rule() -> { test }:
match $t isa test; not { $r isa rule; verifies (source: $t, target: $r); };
return { $t };

# transitive reach, for the perspectives (audience -> usecase -> ... via has)
fun reach($from: node) -> { node }:
match { has (source: $from, target: $to); } or { let $v in reach($from); has (source: $v, target: $to); };
return { $to };
```

Run: `match let $r in rules_without_test(); fetch { "id": $r.nid, "title": $r.title };` (concept documents) [U on exact fetch syntax].
What does NOT move into TypeQL: `conditionsOf` (splitting rule text on newlines, hashing lines into `reality.json` matches), `thresholdFor`, repair options, `RELATIONS.at` proposal logic, the "gated until the dst question was answered" part of needs-cardinality (needs TEMPLATE_ORDER and answered-question state, which are not graph facts). Roughly: the ~6 pure-shape checks translate; the stateful and string-literal checks stay in TS.

## 3. Three architectures

| | (a) status quo: graph.json + TS checks | (b) TypeDB as project store | (c) TypeDB generated from kernel.ts, CI validation only |
|---|---|---|---|
| Buys | Zero new infra. One language, one source (kernel.ts). Checks run in ms in browser and Worker. | Declarative shape rules, recursive path queries for perspectives, cross-project queries, ACID writes, a real query language for the chat agent. | Independent second opinion on shape; catches drift between kernel.ts and checks.ts; exercises the TypeQL path cheaply. |
| Costs | Every new structural check is hand-written TS (small). No graph query language. | A stateful server to run and secure; a schema-sync step whenever kernel.ts changes; commit-time rejection fights soft violations; loses git-diffable graph.json unless exported; a second model of the ontology. | A generator plus schema/data loader to maintain; a second representation that can disagree; value limited because TS checks already cover the same ground. |
| Cloudflare | Native: Worker/Durable Object/Artifacts, no external calls. | Worker must call TypeDB Cloud (or a self-hosted server) over HTTPS via `@typedb/driver-http` [U]; per-check network latency; no Cloudflare-native hosting of TypeDB [U, none found]; one database per project to isolate graphs. | None at runtime. Runs in GitHub Actions or locally with Docker. |
| Cloudflare Artifacts (Git-versioned graph.json) | graph.json is the artifact; history, diff, branch all free. | Two sources of truth unless DB is exported back to graph.json on every commit; DB has no branching, so "semantic GitHub" branches and rollbacks would need re-import. | Artifact stays the truth; CI loads a snapshot from the repo, runs queries, discards the DB. Fits the Git model. |
| Clef checks (CHECKS-SPEC §1) | Unchanged: code decides structure, Clef decides meaning. | Same split, but "code" is TypeQL. Bonus: TypeQL can generate Clef candidate sets (e.g. all problems with no satisfying capability, transitively reachable audience pairs) instead of TS loops. | Unchanged. CI diff between TS and TypeQL violations is a regression test for the structural half. |
| Verdict | Keep. | Not now. | Cheap enough to try as the experiment. |

## 4. Fit assessment

1. **Size**. 243 nodes and 448 edges. Any structural check is a linear scan in memory. TypeDB's strengths (large graphs, optimiser, concurrent writers) buy nothing at this scale.
2. **Hard vs soft constraints**. TypeDB's schema is a gate: invalid state cannot be committed. The kernel's design is the opposite: a graph may be incomplete, and violations become questions to the user (`inv-meta-tests-raise-questions`, commit gate and changesets, `raise: 'question'`). You would use TypeDB with a loose schema (shape only) and put `needs` in functions, which leaves it as a slower query engine over the same data. Only edge shape fits naturally as a schema constraint, and `checks.ts` already does it.
3. **Two sources of truth**. kernel.ts is declared "single source" (S142, S143: declare once, render everywhere). A TypeQL schema must be generated from it, and the generator is new code that must track kernel changes, including template-added kinds (`inv-kernel-additive`: templates add kinds per project, so schema changes per project and need schema transactions, which are exclusive [V, HTTP API]).
4. **Where TypeDB would genuinely help later**: recursive traversal for the user and domain perspectives, "everything impacted by editing this node" for the staleness cascade (S150), cross-project analytics, and giving the chat agent a typed query tool. None is a blocker today because in-memory graph walks are trivial at this size.
5. **Cloudflare**. Nothing in the Workers/Artifacts stack can host TypeDB. Using it means a second platform (Cloud Explore tier is free, so cost is not the issue; operational surface and latency are) [U on Worker-to-Cloud connectivity].

## 5. Verdict

**Later, not now.** Keep graph.json plus TS checks for the uip. Adopt TypeDB only if one of these becomes true: graphs reach thousands of nodes, cross-project queries become a product feature, or the structural checks outgrow hand-written TS (say more than ~20 recursive or path checks). If adopted, take option (c) first, then (b) only with Git export as a derived artifact.

### Smallest experiment (half a day)

1. `docker run` TypeDB Community 3.13.x locally [X]; confirm HTTP port 8000 and `@typedb/driver-http` from Node.
2. Write one script that emits the TypeQL schema from `kernel.ts` (KINDS to entities, EDGE_TYPES to relations and `plays`), and one that loads `lfp/src/graph.json`.
3. Port five checks to functions: edge-shape (via rejected inserts), needs (rule to test, module to interface), orphans, test-has-rule, protocol-realised.
4. Compare violation sets with `checks.ts` on graph.json plus ten seeded mutants. Record: lines of TypeQL vs TS, divergences, any check that cannot be expressed, and wall time.
5. One-hour side test: a Worker doing `fetch` to the Explore-tier Cloud endpoint with the HTTP driver, to settle Workers compatibility and round-trip latency.
   Decision rule: if the five ports match exactly, take fewer lines than the TS, and the Worker call works under ~150 ms, plan (c) in CI. Otherwise close the question.

## Sources
- https://github.com/typedb/typedb/releases/tag/3.13.6
- https://en.wikipedia.org/wiki/TypeDB
- https://typedb.com/blog/typedb-3-0-is-now-live
- https://typedb.com/docs/home/ , https://typedb.com/docs/home/install/drivers/
- https://typedb.com/docs/reference/typedb-2-vs-3/diff/
- https://typedb.com/docs/typeql-reference/annotations/
- https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/
- https://typedb.com/docs/reference/typedb-http-api/
- https://typedb.com/pricing
- https://www.npmjs.com/package/@typedb/driver-http (checked via `npm view`: 3.13.6, Apache-2.0)
