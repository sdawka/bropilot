# datafrog vs ascent for a Rust kernel: research and verdict (2026-10-05)

Question: "research datafrog; if we build our kernel in Rust and have a custom ontology, will that work?"
Legend: [V] verified from a fetched source or a local run, [U] unverified or inferred, [X] not executed.
No Rust toolchain was used. **All Rust below is unverified sketch code [X]**: syntactically plausible, never compiled.

## 0. Local facts this rests on [V, local runs]

- Kernel: 42 kinds, 24 edge types, 11 RELATIONS, 12 QUESTIONS. 6 needs, and **every `min` is 1**, so datafrog's lack of counting costs nothing today.
- `lfp/src/graph.json`: 243 nodes, 448 edges `{id, src, dst, type}`. TS `checkInvariants` runs in **1.9 ms** cold and returns 34 violations.
- Perspectives: 5 chains, 30 hops. `uip/scripts/check-seeds.mjs` keeps a *second* copy of the chains in another shape. That duplication is the real smell.
- TS already runs in the browser, the Worker and Node ≥23.6, which strips types natively.

## 1. The engines, as of October 2026

| engine | latest release | activity | rules expressed as | negation | aggregation | incremental | wasm32-unknown-unknown | licence |
|---|---|---|---|---|---|---|---|---|
| **datafrog** | 2.0.1, 2019-01-02 [V] | repo alive but frozen: last commits are doc/CI (2025-12, 2026-08) [V]; Polonius still pins `datafrog = "2.0.0"` [V] | Rust API: `Variable::from_join / from_antijoin / from_leapjoin / from_map` inside a `while iteration.changed()` loop [V] | antijoin against a fixed `Relation` only [V] | none | batch, semi-naive [V] | very likely: zero runtime deps (only `proptest` dev) [V deps; U build] | Apache-2.0 / MIT [V] |
| **ascent** | see §3, a peer comparison | | | | | | | |
| **crepe** | 0.2.0, 2025-12-14 [V] | slow but alive [V] | `crepe!{}` proc macro [V] | stratified [V] | not in its feature list [U] | batch | likely, pure Rust [U] | MIT OR Apache-2.0 [V] |
| **cozo** | 0.7.6, 2023-12-11 [V] | dormant: last commit 2024-12-04 [V] | CozoScript **text at runtime** [V] | stratified [U] | yes, e.g. `count_unique` [V] | stored relations; batch queries | yes, official `cozo-lib-wasm`, in-memory only [V]; npm unpacked 12.3 MB [V] | MPL-2.0 [V] |
| **egglog** | 3.0.0, 2026-08-19 [V] | very active [V] | text language (e-graphs + Datalog) | n/a | merge functions | batch | has a web demo [U] | MIT [V] |
| **differential-dataflow** | 0.25.1, 2026-07-15 [V] | active [V] | Rust dataflow operators | via `antijoin` | `reduce`, `count` | **yes, truly incremental** | doubtful: timely's worker and thread model [U] | MIT [V] |
| **Soufflé** | 2.5, 2025-03-24 [V] | active | `.dl` text compiled to C++ | stratified | yes | batch | no official target; would need Emscripten [U] | UPL-1.0 [V] |

Sources: crates.io and GitHub APIs (versions, licences, deps, reverse deps, contributors, push dates);
https://github.com/rust-lang/datafrog , https://docs.rs/datafrog/2.0.1/datafrog/struct.Variable.html , https://github.com/rust-lang/polonius ,
https://github.com/frankmcsherry/blog/blob/master/posts/2018-05-19.md (McSherry: "no runtime", every join hand-written and hand-ordered),
https://github.com/s-arash/ascent , https://github.com/ekzhang/crepe , https://github.com/cozodb/cozo , https://github.com/egraphs-good/egglog ,
https://github.com/TimelyDataflow/differential-dataflow , https://github.com/souffle-lang/souffle .

**Binary size [U]**: a kernel crate with serde_json and wasm-bindgen should be about 150–400 KB of .wasm before `wasm-opt`.
**Brief correction [V]**: the "3 MB free / 10 MB paid compressed" Worker limit is out of date. The limits page,
updated 2026-09-05, says 64 MiB uncompressed on both plans and no compressed limit
(https://developers.cloudflare.com/workers/platform/limits/). Size only matters for cozo's cold start.

## 2. "A custom ontology" in datafrog terms

Datafrog has no schema, types or kinds. The ontology becomes **input relations (facts)**, loaded from `ontology.json`,
and every check becomes **rules written as Rust code**. Intern strings to `u32` at load time.

```rust
type Id = u32; type Kind = u32; type ETy = u32; type Space = u32; type Persp = u32;
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)] enum Dir { Out, In }
// facts (each a datafrog::Relation<T>, i.e. a sorted, deduped Vec<T>)
node:       (Id, Kind)                          // graph.nodes
edge:       (Id, Id, Id, ETy)                   // (edge id, src, dst, type)
kind_space: (Kind, Space)                       // KINDS[].space
edge_legal: (ETy, Kind, Kind)                   // EDGE_TYPES from × to; an empty list expands to all 42 kinds
need:       (Kind, ETy, Dir, u32, Kind)         // KINDS[].needs: (kind, edge, dir, min, produces|ANY)
hop:        (Persp, u8, Kind, ETy, Dir, Kind)   // perspective, step, from kind, edge, dir, to kind
singular:   Kind                                 // plus `term`, the orphan exemptions
```
`hop.to_kind` is derived at load time as `step.kinds ∩ legal targets of (from, edge, dir)`. A hop with no legal target is
an ontology bug, so this doubles as a lint. Datafrog joins on the first tuple component, so most of its code is re-keying.

### 2.1 Illegal edge (antijoin) [X]
```rust
use datafrog::{Iteration, Relation, RelationLeaper};
let by_src: Relation<(Id, (Id, Id, ETy))> = edges.iter().map(|&(e, s, d, t)| (s, (e, d, t))).collect();
let kind_of: Relation<(Id, Kind)> = nodes.iter().copied().collect();
let legal: Relation<(ETy, Kind, Kind)> = edge_legal.iter().copied().collect();
// (src,(e,dst,ty)) ⋈ (src,ks) → (dst,(e,ty,ks)) ⋈ (dst,kd) → ((ty,ks,kd), e)
let e1 = Relation::from_join(&by_src, &kind_of, |_s, &(e, d, t), &ks| (d, (e, t, ks)));
let shaped = Relation::from_join(&e1, &kind_of, |_d, &(e, t, ks), &kd| ((t, ks, kd), e));
let illegal: Relation<(Id, ETy, Kind, Kind)> =
    Relation::from_antijoin(&shaped, &legal, |&(t, ks, kd), &e| (e, t, ks, kd));
```
This matches TS: legality is membership in from×to, and dangling edges drop out of the join. Filter unknown edge types first.
The `Relation::from_join/from_antijoin` signatures are [U]. The `Variable` versions are [V].

### 2.2 Unmet need: existence via antijoin (min = 1) [X]
```rust
// need instances: one row per node whose kind has an Out need, gated by ready(produces)
let need_out: Relation<(Kind, (ETy, Kind))> = needs.iter()
    .filter(|n| n.dir == Dir::Out && ready.contains(&n.produces)).map(|n| (n.kind, (n.edge, n.produces))).collect();
let by_kind: Relation<(Kind, Id)> = nodes.iter().map(|&(n, k)| (k, n)).collect();
let inst = Relation::from_join(&by_kind, &need_out, |_k, &n, &(t, p)| ((n, t, p), ()));
// met(src, ty, kind(dst)), plus a copy with ANY so needs without `produces` match any target
let e_dst: Relation<(Id, (Id, ETy))> = edges.iter().map(|&(_, s, d, t)| (d, (s, t))).collect();
let met_k = Relation::from_join(&e_dst, &kind_of, |_d, &(s, t), &kd| (s, t, kd));
let met: Relation<(Id, ETy, Kind)> = met_k.iter().flat_map(|&(s, t, k)| [(s, t, k), (s, t, ANY)]).collect();
let unmet: Relation<(Id, ETy, Kind)> = Relation::from_antijoin(&inst, &met, |&(n, t, p), _| (n, t, p));
// In-needs (rule←verifies, protocol←realises) mirror this with src and dst swapped.
```
`ready(k)` is TS's `needReady` as facts built from `answered`, which the UI passes in.
**min > 1**: datafrog cannot aggregate. Count run lengths over the sorted `met_k.elements` [U that it is public] with `chunk_by` in plain Rust.

### 2.3 Orphan node [X]
```rust
let touched: Relation<Id> = edges.iter().flat_map(|&(_, s, d, _)| [s, d]).collect();
let exempt: Relation<Kind> = singular.iter().copied().chain([TERM]).collect();
let n_by_id: Relation<(Id, Kind)> = nodes.iter().copied().collect();
let lonely = Relation::from_antijoin(&n_by_id, &touched, |&n, &k| (k, n));   // (kind, node), no edges at all
let orphans: Relation<(Kind, Id)> = Relation::from_antijoin(&lonely, &exempt, |&k, &n| (k, n));
```
TS also raises a kind with link rules only once a candidate partner exists. That costs two more joins and an `m≠n` closure filter.

### 2.4 Perspective reachability per column (recursive, hops as data) [X]
```rust
let mut it = Iteration::new();
// reach(node, (persp, root, step)), seeded with every node whose kind is step 0 of a perspective
let reach = it.variable::<(Id, (Persp, Id, u8))>("reach");
reach.extend(roots.iter().map(|&(p, n)| (n, (p, n, 0))));
let r_k   = it.variable::<((Persp, u8, Kind), (Id, Id))>("r_k");        // keyed for hop lookup
let r_hop = it.variable::<((Id, ETy, Dir), (Persp, Id, u8, Kind))>("r_hop");
let r_to  = it.variable::<((Id, Kind), (Persp, Id, u8))>("r_to");
// facts: hop_k((p, s, from), (ety, dir, to)); adj((n, ety, dir), m) holds both directions; node_set((m, k), ())
while it.changed() {
    r_k.from_join(&reach, &kind_of, |&n, &(p, root, s), &k| ((p, s + 1, k), (root, n)));
    r_hop.from_join(&r_k, &hop_k, |&(p, s, _), &(root, n), &(t, d, to)| ((n, t, d), (p, root, s, to)));
    r_to.from_join(&r_hop, &adj, |_, &(p, root, s, to), &m| ((m, to), (p, root, s)));
    reach.from_join(&r_to, &node_set, |&(m, _), &(p, root, s), &()| (m, (p, root, s)));
}
let reach = reach.complete(); // column s of root r in perspective p = { m | (m,(p,r,s)) }
```
It terminates because no hops exist past the last step. One Datalog rule needs four helper Variables. `from_leapjoin` would fuse two.

**Bridge nodes** are a self-join of `reach` on `n` with `p1 < p2`. At the kind level the ontology alone decides them. I ran that in JS [V],
and it disagrees with the hard-coded `BRIDGE_KINDS`:

| | kinds |
|---|---|
| derived (in ≥2 perspectives) | usecase, problem, capability, feature, screen, interface, thing, rule, test |
| hard-coded in perspectives.ts | screen, interface, thing, test, capability, **module** (module appears in Domain only) |

Deriving the set in any language removes a hand-kept list that has already drifted.

## 3. datafrog vs ascent

### 3.1 The same four checks in ascent [X]
Same facts as §2. Unverified [U]: the `!` negation spelling, expressions like `s + 1` as body arguments, and whether
`count()` yields 0 for an empty group or no row.
```rust
use ascent::{ascent, aggregators::count};
ascent! {
  struct Kernel;
  relation node(Id, Kind);  relation edge(Id, Id, Id, ETy);  relation known_ety(ETy);
  relation edge_legal(ETy, Kind, Kind);  relation need(Kind, ETy, Dir, usize, Kind);  relation ready(Kind);
  relation exempt(Kind);  relation linkable(Kind, Kind);  relation hop(Persp, u8, Kind, ETy, Dir, Kind);  relation root(Persp, Id);
  // 1. illegal edge
  relation illegal(Id, ETy, Kind, Kind);
  illegal(e, t, ks, kd) <-- edge(e, s, d, t), known_ety(t), node(s, ks), node(d, kd), !edge_legal(t, ks, kd);
  // 2. unmet need, any min (count, not existence)
  relation link(Id, ETy, Dir, Kind);
  link(s, t, Dir::Out, kd) <-- edge(_, s, d, t), node(d, kd);
  link(d, t, Dir::In, ks)  <-- edge(_, s, d, t), node(s, ks);
  link(n, t, dir, ANY)     <-- link(n, t, dir, _);
  relation unmet(Id, ETy, Dir, Kind, usize);
  unmet(n, t, dir, p, c) <-- node(n, k), need(k, t, dir, min, p), ready(p), agg c = count() in link(n, t, dir, p), if c < *min;
  // 3. orphan, with TS's candidate gate
  relation touched(Id);  relation orphan(Id, Kind);  relation has_candidate(Id);  relation raise_orphan(Id);
  touched(s), touched(d) <-- edge(_, s, d, _);
  orphan(n, k) <-- node(n, k), !touched(n), !exempt(k);
  has_candidate(n) <-- orphan(n, k), linkable(k, t), node(m, t), if m != n;
  raise_orphan(n) <-- orphan(n, k), !linkable(k, _);
  raise_orphan(n) <-- has_candidate(n);
  // 4. perspective reachability per column, plus bridges
  relation reach(Persp, Id, u8, Id);  relation bridge(Id);
  reach(p, r, 0, r) <-- root(p, r);
  reach(p, r, s + 1, m) <-- reach(p, r, s, n), node(n, k), hop(p, s + 1, k, t, Dir::Out, to), edge(_, n, m, t), node(m, to);
  reach(p, r, s + 1, m) <-- reach(p, r, s, n), node(n, k), hop(p, s + 1, k, t, Dir::In, to),  edge(_, m, n, t), node(m, to);
  bridge(n) <-- reach(p1, _, _, n), reach(p2, _, _, n), if p1 < p2;
}
// let mut k = Kernel::default(); k.node = nodes; k.edge = edges; /* … facts from ontology.json */ k.run(); k.unmet
```
`ascent!` generates a struct with one `pub Vec<tuple>` field per relation, and `run()` evaluates to a fixpoint.

**Lines of rule code per check** (counted from the sketches; re-keying and `use` lines included for datafrog):

| check | datafrog (§2) | ascent (§3.1) | what the difference is |
|---|---|---|---|
| illegal edge | 7 | 1 | three re-keyings and two joins vs one rule |
| unmet need, min = 1 | 10 | 5 | datafrog antijoins existence; ascent counts |
| unmet need, min > 1 | +about 10 lines of plain Rust over a sorted Vec | 0 extra | ascent's `agg … count()` already handles it |
| orphan + candidate gate | 5 + 2 joins not written out | 5 | ascent states the gate as two rules |
| reach per column | 14, with 4 helper Variables | 3 | ascent plans the join order itself |
| bridges | self-join plus filter, about 4 | 1 | |

Clarity follows the line count: each ascent rule reads like the kernel invariant it enforces. Each datafrog block
reads like a query plan. A reviewer comparing either with checks.ts will find ascent faster to check.

### 3.2 Feature table

| | datafrog 2.0.1 | ascent 0.8.1 |
|---|---|---|
| rule syntax | Rust method calls (`from_join`, `from_antijoin`, `from_leapjoin`, `from_map`) in a `while changed()` loop [V] | Datalog in a proc macro: `head <-- body`, plus `if`, `let`, `for` and arbitrary Rust exprs [V] |
| aggregation | none [V] | `count`, `sum`, `min`, `max`, `mean`, `percentile` and user-defined aggregators [V] |
| negation | antijoin against a fixed `Relation`; you stratify by hand [V] | stratified negation, strata computed by the macro [V] |
| lattices | no | `lattice` relations with a user `Lattice` join, e.g. shortest path [V] |
| evaluation | semi-naive within one run; nothing kept across runs [V] | semi-naive, SCC-ordered strata [V]; re-running with added facts is unverified [U] |
| parallelism | none | `ascent_par!` via optional `rayon` [V]; leave it off for wasm |
| wasm build | zero runtime deps, so it should just build [V deps, U build] | a documented **`wasm-bindgen` feature** [V]; deps include `hashbrown`, `rustc-hash`, `web-time` |
| compile-time cost | negligible, a small generic crate [U] | proc macro (`ascent_macro`) generates indices per access pattern, so expect seconds per crate rebuild [U] |
| binary size | sorted Vecs and merge joins, smallest [U] | hash indices per relation and access pattern, likely +100–300 KB before `wasm-opt` [U] |
| last release | 2019-01-02 [V] | 2026-08-29 [V] |
| maintainers | rust-lang org: nikomatsakis, ecstatic-morse, frankmcsherry, lqd [V]; now only doc and CI commits | essentially one: s-arash with 142 commits, next contributor 14 [V]; a bus-factor-of-one risk |
| who uses it | 6 reverse deps, including polonius and polonius-engine [V] | 11 reverse deps, including Quantinuum's `tket` and `hugr-passes` [V names; U on how they use it]; CC'22 and OOPSLA'23 papers |
| licence | Apache-2.0 / MIT [V] | MIT [V] |

### 3.3 Ontology as data, in each
- **Both load the ontology at runtime** from `ontology.json`: `Relation::from_iter` in datafrog, `k.need = …` in ascent.
  New kinds, edge types, needs with any `min`, or hops are picked up **without recompiling**, because rules quantify over them.
- **Neither takes new rule shapes at runtime.** A new invariant means a recompile in both, as it does in checks.ts today.
- **ascent goes a little further.** `ascent_run!` puts locals in scope inside rules, so runtime values such as `answered`
  or thresholds parameterise rules directly [V]. Datafrog closures can capture them too, but only as hand-placed filters.
  An `ascent-interpreter` crate exists among ascent's reverse deps and might run rules as text. I have not evaluated it [U].

### 3.4 The pick: ascent
**Pick ascent.** The deciding reason is that it expresses `count` and `not` inside the rules. Every structural check,
including future min>1 needs, stays one declarative rule over ontology facts instead of hand-planned joins plus Rust
counting passes. Maintenance is a second reason, with a bus-factor-of-one caveat. Datafrog wins only on size and compile time.

## 4. What no Datalog engine fixes here

1. **Batch, not incremental**, in both. At this size a full recompute is microseconds [U], so it does not matter.
2. **Some checks are not relational**: rule conditions with `isCovered`, task lifecycle props, message text. These stay plain Rust functions.
3. **cozo** alone makes rules data, but it is dormant, MPL-2.0 and several MB of wasm. Rejected. differential-dataflow, egglog and Soufflé solve other problems.
4. **Plain loops are the fallback.** They diff most easily against checks.ts. Ascent wins once reach, bridges and the staleness cascade (S150) join the crate.

## 5. Architecture: `bropilot-kernel` (if built)

- **Crate**: `ontology.rs` (serde structs for the existing `uip/src/data/ontology.json`, unchanged),
  `graph.rs` (serde Graph and an intern table), `checks.rs` (an `ascent!` program for the relational checks, plain fns for the rest), `persp.rs` (hops, reach, bridges),
  `lib.rs` (wasm-bindgen exports). One `.wasm` built with `wasm-pack --target web` for the browser bundle,
  `--target bundler` (or raw `WebAssembly.instantiate`) for the Worker, and `--target nodejs` for scripts.
- **Wasm API**, JSON strings in and out, so TS types stay as they are [X]:
  ```rust
  #[wasm_bindgen] pub fn load_ontology(json: &str) -> Result<u32, JsError>;              // handle; validates hop/edge_legal consistency
  #[wasm_bindgen] pub fn check_structure(onto: u32, graph: &str, opts: &str) -> String;   // opts: {answered, realityMatches}; → Violation[] (checks.ts shape)
  #[wasm_bindgen] pub fn edge_legal(onto: u32, ety: &str, from_kind: &str, to_kind: &str) -> bool;
  #[wasm_bindgen] pub fn legal_edges_between(onto: u32, from_kind: &str, to_kind: &str) -> String; // for repair/retype offers
  #[wasm_bindgen] pub fn perspective_columns(onto: u32, graph: &str, persp: &str, root: &str) -> String; // [[nodeId]] per step
  #[wasm_bindgen] pub fn bridges(onto: u32, graph: &str) -> String;                       // {kinds:[], nodes:{id:[persp]}}
  #[wasm_bindgen] pub fn plan_structural_units(onto: u32, graph: &str, scope: &str) -> String; // the `code`-resolved CheckUnits of CHECKS-SPEC §3.3 step 1
  ```
- **What it replaces**: the structural half of `lfp/src/checks.ts`, the code-decided entries in CHECKS-SPEC §1, the hop
  walk in perspectives.ts and the chain copy in check-seeds.mjs. Rust returns `{invariant, subjects, produces}`. A thin
  TS adapter adds messages and options, so the UIs do not change. Clef stays in the Worker for semantic checks.
- **Source of truth**: keep `kernel.ts` and emit `ontology.json` as today, per S142/S143's "declare once". Rust consumes
  the JSON and owns no vocabulary. Making Rust the source with `ts-rs` moves lfp authoring into cargo for no gain.
- **Effort** [U, one engineer who knows Rust]: spike 1 day; checks at parity 2–3; wasm-bindgen and three
  targets 1; TS adapter into lfp store, uip useChecks and Worker 1–2; perspectives and bridges 1; golden-diff harness
  over 3 seed graphs plus mutants in CI 1. **Total 7–9 days.**
  Migration order: check-seeds (Node, lowest risk), then uip structural units, then the Worker, then the lfp store.
- **The real risk is two kernels during migration.** Mitigate with a golden test that runs both on every seed graph and
  fails on any diff. A lasting cost remains: a Rust toolchain and wasm build in a repo that is pure TS/Node today.

## 6. Verdict

**Yes, it works, with conditions.** A Rust kernel with the ontology as runtime data expresses every current structural
check and compiles to wasm for browser, Worker and Node. Datafrog could do it (all min=1, single antijoins), but
**ascent is the engine to use** (§3.4). Build it only if you want one artefact *and* accept a Rust build in a TS repo.
Otherwise a shared TS module fixes the real duplication more cheaply, since TS already runs everywhere at 1.9 ms.

**Smallest spike** (one day, on a machine with cargo) [X]:
1. `cargo new --lib`; add `ascent = { version = "0.8", features = ["wasm-bindgen"] }`, `datafrog = "2"`, serde, serde_json, wasm-bindgen.
2. Load `lfp/src/graph.json` and `uip/src/data/ontology.json`. Compute illegal edges, unmet needs (all questions answered)
   and orphans in **both** engines. Add one artificial `min: 2` need to exercise `count`.
3. Diff violation ids against `checkInvariants` and `node uip/scripts/check-seeds.mjs` over all three seed graphs.
4. `wasm-pack build --target web --release` per engine. Report .wasm size raw and after `wasm-opt -Oz`, plus clean build
   time. Call it from a Vite page and from `wrangler dev`.
5. Decision rule: build the crate on ascent if it matches TS exactly and its wasm is under 500 KB. Fall back to
   datafrog only if ascent fails the wasm build. If neither matches, keep TS and extract a shared module.
