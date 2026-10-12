# Ontology engine as a library

Status: accepted design, 2026-10-12. Consumer: `artyfact-cf`. Implementation in `packages/ontology-engine`.

## What exists today

Two partial implementations of the same engine live in two repositories.

| Concern | artyfact-cf | bropilot |
|---|---|---|
| Template shape | `packages/model/src/schema.ts` (zod, fixed node kinds and relation vocabulary); a template adds nodes, criteria, hooks, `requires` sections | `crates/world-core/src/lib.rs`: `WorldTemplate` / `ThingTemplate` with `ObjectShape`, `RelationEndpoint`, `RequiredRelation`, `ForbiddenCycle`, `IncompatibleConstraint` |
| Instance state | YAML directory loaded by `loadSystem`, flattened by `toFacts` into ~60 fixed EDB relations | `WorldSnapshot` with `ModelObject`, `ModelRelation`, `CompletenessDeclaration` |
| Deterministic checks | `@artyfact/rules`: own Datalog dialect, stratified negation, derivation trees, zero dependencies; rule packs in `packages/templates/rule-packs/*.dl` keyed by kit | `ascent` programs compiled into Rust; `evaluate_readiness` |
| Judgment | `@artyfact/semantic`: System One question catalogue, probabilities, policy thresholds (0.9 confident, 0.5 review), fake provider | Jev / System One seam in `lfp` |
| Form validity of the template | zod parse plus `id@version` matches directory name | shape structs, no versioned meta-schema |

The artyfact side is closer to a library already: `model`, `rules`, `semantic` and `templates` are separate packages, the rules engine is self-contained, and every finding carries a derivation and the pack hash that produced it. Its limit is that the vocabulary is closed. Node kinds, relation names, the fact relations and the core packs are fixed in `schema.ts`, `facts.ts` and the bundled `.dl` files. A template cannot introduce a kind, a relation, a cardinality rule or its own fact relations. That is exactly what the requirement asks for.

The bropilot Rust core has the open vocabulary (templates declare shapes, endpoints, required relations, forbidden cycles, incompatible constraints, completeness declarations) but no portable rule language, no derivations, and a JSON contract tied to the World platform.

## Requirement, restated

One engine, independent of any particular template, that answers two questions:

1. **Form.** Is this template, at this version, a valid template? Does it describe a coherent ontology whose constraints can in principle be satisfied?
2. **State.** Given a template and a partially filled instance, how complete, consistent and correct is the instance, and can it be built?

The template carries its own criteria, relationships and rules. The engine supplies the meta-schema, the evaluation machinery, the judgment protocol and the report shape. Deterministic reasoning answers everything it can. System One models answer bounded questions with probabilities. An LLM is an optional provider behind the same interface, never a requirement.

## Architecture

Three layers, each a package or module, each usable alone.

### 1. Meta-schema (`meta@1`, versioned)

The grammar of templates. A template is data that conforms to the meta-schema. The meta-schema is itself versioned so templates pin `meta: 1` and the engine can refuse or migrate.

A template declares:

- `id`, `version`, `meta`, `extends` (another template ref; refinement by reference, as world-core's Thing templates inherit shared context).
- `kinds`: node kinds with their fields (name, type, required, enum values), allowed parents, and `completeness` rules (required fields, required children with cardinality, required relations with cardinality).
- `relations`: relation vocabulary with endpoint kinds, cardinality on each side, `acyclic`, `inverse`, and `certainty` defaults.
- `constraints`: cross-cutting declarations the engine already understands without custom rules: forbidden cycles over a relation set, incompatible field combinations, mutually exclusive relations, "exactly one of" groups, declared-complete scopes.
- `criteria`: as in artyfact today, with owner, subject kind, severity, gates and hooks.
- `rules`: Datalog packs in the engine's dialect, scoped to the template and allowed to declare new derived relations. Packs may only read fact relations the meta-schema emits plus relations the template declares.
- `questions`: a catalogue of System One questions the template wants asked, each with the state slice it needs, the answer type (yes/no, choice, score), a `benign` answer for the fake provider, and the policy that turns an answer into a finding level.
- `nodes`: prefilled nodes with `$self` placeholders, as artyfact templates do now.

### 2. Generic graph and deterministic core

The instance is a graph, not a YAML layout. Canonical form is JSON:

```
{ template: "template.thing.x@2", nodes: [{id, kind, parent?, fields, provisional?}],
  links: [{from, rel, to, certainty?}], declarations: [{scope, status}], evidence: [...] }
```

Loaders are adapters. The first adapter reads artyfact's YAML directory layout and emits this graph, so artyfact-cf keeps its files until it wants to change them.

`toFacts` becomes generic. It emits a small fixed set of EDB relations from the graph (`node/3`, `field/3`, `parent/2`, `link/4`, `known/1`, `ref/3`, `declared/2`, `provisional/1`) and a second set from the template (`kind/1`, `kindField/4`, `relEndpoint/3`, `relCard/4`, `relAcyclic/1`, `requiredRel/4`, `requiredChild/4`, `incompatible/…`). Template-specific relations such as artyfact's `stepScreen` or `policyMode` move into the template as derived relations or as typed fields on kinds.

Three engine-owned packs run on every evaluation:

- `metamodel`: dangling refs, missing parents, containment cycles, multi-parent, unknown kinds, relations whose endpoints violate the vocabulary.
- `completeness`: required fields, required children, required relations by cardinality, scopes not declared complete, provisional nodes still present. Findings here are `missing`, not `error`.
- `consistency`: cardinality upper bounds exceeded, forbidden cycles, incompatible constraints, exclusive groups violated, contradictory certainty (an `observed` link contradicting a `declared` one).

Template packs run after them. Every finding keeps its derivation tree and the `pack@version` hash, as `@artyfact/model` findings do today.

**Form validity** uses the same machinery turned on the template: the template is loaded as a graph whose kinds are the meta-schema's kinds, and a `meta@1` pack checks it. Examples: a required relation between two kinds the vocabulary does not allow is unsatisfiable; a rule pack reads a relation nobody emits; packs fail to stratify; `extends` chains cycle; a criterion subjects a kind the template does not declare. The report is `TemplateForm { valid, findings, hash }` and is cached by template hash.

### 3. Judgment

The deterministic layer emits `semanticCandidate(rule, subject, text)` rows where a rule decides a question needs judgment. The judgment layer resolves each candidate against the template's question catalogue, builds the bounded state slice, asks the provider, and applies policy. This is `@artyfact/semantic` generalised: the question catalogue comes from the template rather than from `questions.ts`.

Provider interface stays as it is: `SystemOne.ask(state, questions) → probabilities`. Implementations: fake (deterministic, directive driven), System One HTTP, LLM. Policy is deterministic: a `yes` at or above the confident threshold becomes the finding level the template declared; between review and confident becomes `review`; below review stays `unknown`. Unknown never passes. Provenance records provider, state hash and question hash so a judgment can be replayed or invalidated when the slice changes.

### Report

```
Readiness {
  snapshotHash, template: {ref, hash, form: TemplateForm},
  packs: [{id, version, hash}],
  findings: Finding[],            // level, rule, subject, message, facts, derivation, pack, provenance?
  completeness: { required, satisfied, missing: subjects[] },
  consistency:  { violations: n },
  judgments:    { confident, review, unknown },
  buildable: boolean,              // no hard violation, no missing, no blocking unknown
  actionable: boolean              // same, but soft and advisory ignored
}
```

`diff(a, b)` over two snapshots returns the semantic delta (added, removed, changed nodes and links) and which findings appeared or resolved, as `diffModels` does now.

## Packaging

One npm package, TypeScript, no runtime dependencies beyond `yaml` in the loader adapter, runs in Workers and Node.

```
@bropilot/ontology-engine
  meta/        meta-schema, template loader, TemplateForm check
  graph/       canonical graph types, YAML directory adapter, JSON adapter
  rules/       moved verbatim from @artyfact/rules
  evaluate/    toFacts, core packs, Readiness, diff
  judge/       provider interface, fake, policy, candidate resolution
```

Recommended home: `packages/ontology-engine` in this repository, published to npm, with `artyfact-cf` depending on it and deleting `packages/rules`, most of `packages/model` and the generic half of `packages/semantic`. artyfact keeps its templates, its question catalogue, its YAML files and its hooks and gates. The Rust `world-core` is not on the path: its template concepts are ported into `meta@1`, and a wasm build is a later step only if a non-JS host needs it.

## Migration from artyfact-cf

1. Move `@artyfact/rules` into the engine unchanged. Its tests move with it.
2. Write `meta@1` and express the current artyfact node kinds, relation enum and `Template` zod shape as a `template.meta.artyfact-genome@1` template that other artyfact templates `extend`. Prove form validity on the six bundled templates.
3. Write the YAML directory adapter so `loadSystem` output maps onto the canonical graph without loss. Compare `toFacts` old and new on the Keep in Touch example; the diff must be explainable by relations that moved into the template.
4. Port `metamodel@1` and `readiness@1` to the engine-owned packs. The remaining packs (`authorization`, `journeys`, `theory`, `topology.private-pairs`) become template packs.
5. Move the provider, fake, policy and judgment runner into `judge/`; the artyfact question catalogue becomes template `questions`.
6. Switch `apps/platform` and `packages/cli` to the engine. Readiness output for the example must match the old findings set, rule for rule.

## Acceptance criteria

- Same template, same instance, same packs give byte-identical `Readiness` on Node and Workers.
- A template that fails form validity cannot be used to evaluate an instance; the error names the rule and the template hash.
- Every finding carries a derivation whose leaves are EDB facts or a judgment with provenance.
- No finding reaches `pass` or `error` from a judgment below the confident threshold.
- The Keep in Touch example reproduces its current findings through the adapter.
- A second template with kinds and relations that do not exist in artyfact evaluates without touching engine code.

## Implementation notes (milestone 1, 2026-10-12)

`packages/ontology-engine` holds the rules engine (moved verbatim), `meta@1`, the canonical graph, generic fact emission, the three core packs, the template form check, `evaluate` and `diff`. The judgment layer and the YAML adapter are not built yet. Where the implementation sharpened the design above:

- Packs are TypeScript modules exporting `.dl` source strings, so no file reads or raw imports are needed on Workers.
- `node(Id, Kind, Parent)` with `""` for a root. `relEndpoint(Rel, Side, Kind)` and `relCard(Rel, Side, Min, Max)` with `Max = -1` for unbounded; `Side` is `out` (links per source) or `in` (links per target). Lower bounds are completeness (`missing`), upper bounds are consistency (`violation`).
- Extra EDB relations beyond the list above: `fieldType`, `typeAccepts`, `kindFieldEnum`, `requiredField`, `relation`, `relInverse`, `relCertainty`, `forbiddenCycle`, `incompatible`, `incompatibleSize`, `exclusive`, `exactlyOne`, `completeScope`, `criterion`, `criterionGate`, `criterionHook`, `question`, `graphTemplate`, `templateRef`, `evidence`. `src/evaluate/edb.ts` is authoritative.
- Output relations carry `(Rule, Subject)`, so a completeness obligation is per node and rule; the missing field or relation is visible in the derivation. `completeness@1` also emits `obligation/2` to count required versus satisfied.
- Mutually exclusive relations are disjoint on the same `(from, to)` pair. Exactly-one groups give `missing` on zero and `violation` on two or more. A declared-complete scope requires `declared(node, "complete")` on each node of the listed kinds. Contradictory certainty is an `observed` link to a different target than a `declared` link on a relation whose out maximum is one.
- Inverse is metadata; inverse links are not materialised.
- Template packs run in a second `run()` after the core packs and may read only EDB relations and what they derive; `meta@1` enforces this.
- Severity maps hard to `error`, soft to `warning`, advisory to `info`. `actionable` is no `error`, no `missing` and not `incomplete`. `buildable` additionally requires no `warning` and no open semantic candidate. Advisory never blocks.
- `meta@1` also checks unknown inverse, parent, field, relation, constraint and extends references, unsatisfiable required children, and prefilled nodes of unknown kind.
- `extends` merges wholesale per key: kinds and relations replace by name, everything else by id, child wins. Template, node and link schemas are strict.
- `evaluate` caches template form by hash and throws `TemplateFormError` (`rule`, `templateHash`, `findings`) on an invalid template.

## Implementation notes (milestone 2, 2026-10-12)

`src/judge/` and `src/adapters/artyfact/` are built. All six artyfact rule packs are ported as template packs on `template.meta.artyfact-genome@1`, and the Keep in Touch example reproduces artyfact's findings rule for rule.

- A question matches a candidate when the question id equals the candidate's rule id. The slice is structured (`parents`, `hops`, `direction`, `rels`, `kinds`, `fields`), so it is hashable and `meta@1` can reject slices naming unknown kinds or relations.
- Levels `review` and `pass` exist and come only from judgment. A confident answer the policy does not map stays `unknown`. Provenance records provider, state hash, question hash and thresholds, never timing.
- `buildable` also blocks on `review` and on any semantic finding without a confident judgment. `evaluate` stays synchronous; `judge` and `evaluateAndJudge` are async.
- Ported packs are named `artyfact.*` and read `a`-prefixed relations derived by `artyfact.facts@1`, because `node`, `criterion` and `ref` already exist in the generic EDB. Rule ids and messages are verbatim. The dialect has no lowercase, so topology text rules match case-insensitively with generated character classes.
- Adapter mapping: criterion hooks, hook criteria, `satisfies`, claim activities, step requirement refs and step next objects stay as list fields; `stepNext` links exist alongside. Unresolved step targets are fields. Required but unpinned kits and artifacts are nodes. Lost on load: a cross link's `label` and `source`, whether `refines` came from a field or a link, and whether a thing's sections were defaulted from its template.
- The generic core adds `node.provisional` missing findings on Keep in Touch that artyfact does not have, so the example is actionable but not buildable under this engine. That is the intended stricter reading, not a parity failure.
- The reference for parity tests is artyfact's own `toFacts` and `validate`, vendored under `test/vendor/artyfact/` with only import lines changed.

## Decisions

Recorded in `decision_log.md` on 2026-10-12: the package lives in this repository as `packages/ontology-engine`; the `@artyfact/rules` Datalog dialect is the rule language; artyfact-cf keeps YAML behind the loader adapter and the canonical instance format is the JSON graph.
