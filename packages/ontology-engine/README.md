# @bropilot/ontology-engine

A template-independent ontology engine. A template declares kinds, relations, constraints, criteria, rule packs and questions against the versioned meta-schema `meta@1`. The engine checks that the template is well formed, then evaluates an instance graph against it and reports readiness with a derivation for every finding. The design is `docs/ontology-engine-library.md`.

TypeScript ESM. The runtime dependencies are `zod` and `yaml`. Hashing is synchronous, so the same code runs in Node and Workers. Only `@bropilot/ontology-engine/artyfact/node` touches the file system.

## What exists

| Module | Contents |
|---|---|
| `src/rules/` | The Datalog engine moved verbatim from `@artyfact/rules`; see `src/rules/README.md` for the dialect. |
| `src/meta/` | `meta@1` zod schemas, cardinality grammar (`1`, `0..1`, `1..*`, `0..5`), `loadTemplate` with `extends` resolved through a `TemplateStore`, `templateHash`, `instantiateNodes` for `$self`, and `checkTemplateForm`. |
| `src/graph/` | The canonical JSON graph (`template`, `nodes`, `links`, `declarations`, `evidence`), `parseGraph` and `graphHash`. |
| `src/evaluate/` | `toFacts`, the engine-owned packs `metamodel@1`, `completeness@1`, `consistency@1` and `meta@1`, `evaluate` returning `Readiness`, `diff` and `diffFindings`. |
| `src/judge/` | The System One provider interface, `httpSystemOne`, `fakeSystemOne` with `#s1low`, `#s1no`, `#s1pick:` and `#s1harm` directives, `offSystemOne`, `S1Error`, the confidence policy, `buildSlice`, `judge` and `evaluateAndJudge`. |
| `src/adapters/artyfact/` | The `template.meta.artyfact-genome@1` base template, `loadArtyfactSystem` for an artyfact system directory, `loadArtyfactTemplate` and `artyfactMetaStore` for artyfact templates, and the ported artyfact rule packs. |
| `src/adapters/product/` | `template.meta.product-spec@1` for the uip/lfp product graphs with `productGraphToGraph`, and `template.meta.bropilot-spaces@3` for the older spaces graphs with `spacesGraphToGraph`. |
| `src/adapters/world/` | `template.meta.world@1` with `world.readiness@1`, `worldTemplateToMeta` and `worldSnapshotToGraph` for world-core `WorldSnapshot`s, and `toWorldFindings` and `worldStatus` to read a readiness in world-core's terms. |

## Judgment

`evaluate` stays synchronous and leaves semantic candidates as `info` findings with rule `semantic:<rule>`. `judge(readiness, template, graph, provider, opts?)` resolves each candidate through the template question whose `id` is the candidate's rule. The question's `slice` names what the provider sees: the subject with its fields, its parent chain (`parents`), and nodes up to `hops` links away, filtered by `direction` (`out`, `in`, `both`), `rels` and `kinds`. `fields` limits every node to the named fields. The slice and the question are hashed into the provenance.

| Provider answer | Status | Level |
|---|---|---|
| Confidence at or above `thresholds.confident` (default 0.9) | `confident` | The question's policy level for that answer, else `unknown`/`info` |
| Confidence from `thresholds.review` (default 0.5) up to `confident` | `review` | `review` |
| Lower confidence, an unreadable answer or no policy entry | `unknown` | `info` |
| No question for the rule | `unknown`, provider `off` | `info` |
| Provider throws | `unknown`, provider `error` | `info` |

Provenance records the provider, model, `stateHash`, `questionHash` and thresholds. It carries no timing, so the judged `Readiness` JSON is reproducible with the fake provider.

## artyfact adapter

`loadArtyfactSystem(files, { templates })` takes a map of relative path to YAML text, so it runs in Workers; `readDir(root)` from `@bropilot/ontology-engine/artyfact/node` builds that map in Node. Things, ontology nodes, externals, purposes, claims, requirements, criteria, hooks, journeys, steps (`<journey>/<step>`), evolutions, kits and artifacts become nodes. Cross links, beneficiaries, subjects, owners, source refs, acceptance criteria and resolved step targets become links; unresolved step targets stay as fields. Kits that are required but not pinned still become `kit` nodes.

The base template runs `artyfact.facts@1`, which derives `a`-prefixed artyfact relations from the generic graph, then `artyfact.metamodel@1`, `artyfact.readiness@1`, `artyfact.authorization@1`, `artyfact.journeys@1`, `artyfact.theory@1` and `artyfact.topology.private-pairs@1`. Rule ids and messages match artyfact. The dialect has no case folding, so the topology pack matches mixed-case patterns where artyfact lowercases text. The base template asks one question, `topology.multiRecipient`.

Not carried over: a cross link's `label` and `source`, whether `refines` came from a field or a cross link, and whether a thing's sections were defaulted from its template.

## Product specs

Two templates that share no vocabulary with artyfact, evaluated by the same engine without engine changes.

| Template | Loader | Input |
|---|---|---|
| `template.meta.product-spec@1` (`productSpec`) | `productGraphToGraph(json, opts?)` | A uip project graph or lfp `graph.json`: `{ nodes: [{id, kind, title, status, source, props}], edges: [{id, src, dst, type}] }` |
| `template.meta.bropilot-spaces@3` (`bropilotSpaces`) | `spacesGraphToGraph(json)` | The spaces schema of the bropilot-extract skill: `{ meta, nodes: [{id, kind, title, source, codeAlignment}], edges: [{srcId, dstId, type}] }` |

Both loaders add a synthetic root `$spec` of kind `spec` and make it the parent of every node, so "exactly one name" and "one purpose" are child cardinalities on `spec`. `source` is flattened into `source.kind`, `source.statements`, `source.reason` and `source.note`. `props` become `props.<key>` fields, because `props.status` exists on agents, tasks and test results alongside the node `status`. An edge status other than `committed` becomes the link's certainty. Edge ids, spaces edge labels and the lfp content version `v` are dropped.

`product-spec@1` takes its 42 kinds, prop enums and 24 edge types with their endpoint kinds verbatim from uip `src/data/ontology.json`. Its rules:

| Rule | Mechanism | Level |
|---|---|---|
| One `name`, one `purpose`, at most one `summary` and `design-system` | `spec` child cardinalities | `missing`, or `children.max` error |
| A purpose motivates an outcome; a test verifies a rule; a task targets a test | `requiredRel` | `missing` |
| Every rule is verified by a test | `verifies` in-cardinality `1..*` | `missing` |
| A term has a description | completeness field | `missing` |
| Evidence either supports or refutes, not both | `exactlyOne` | `missing` or error |
| `contains` has no cycles | `acyclic` | error |
| A bet references a metric, a module exposes an interface, a protocol is realised by a practice | `product.needs@1` | `missing` |
| An audience is served by a feature or capability, or has a flow | `product.checks@1` | `missing` |
| Status other than `committed` | `product.checks@1` `node.proposed` | warning |
| Self-loop, evidence verdict against its edge type, feature stages without a flow, a failing or missing test result no task targets | `product.checks@1` | warning or error |
| An outcome no metric monitors | `product.checks@1` candidate, question `outcome.measurable` | judged |

The question `outcome.measurable` asks System One whether the outcome is stated so that it can be measured. The slice is the outcome plus the purposes, problems, metrics and bets one link away. A confident yes passes and a confident no is a warning. An outcome that a metric monitors is decided by structure and never asked about.

`node.proposed` keeps an uncommitted node actionable but not buildable. `productGraphToGraph(json, { provisionalFlag: true })` also sets the engine's `provisional` flag, which makes such nodes `missing`.

`bropilot-spaces@3` is deliberately small. Its edges connect any kinds, `contains`, `extends` and `depends_on` are acyclic, `name` and `purpose` each need a `has` link, and `spaces.checks@1` reports `codeAlignment: broken` as a warning and `roadmap` as info.

## World snapshots

`src/adapters/world/` evaluates a world-core `WorldSnapshot` (`crates/world-core`, contract in `@bropilot/contracts`) and uses the Rust `evaluate_readiness` as its oracle.

`worldTemplateToMeta(snapshot)` turns the snapshot's World Template and Thing Templates into `template.world.<id>@<version>`, which extends `template.meta.world@1`. A non-numeric World Template version becomes meta version `0`.

| World Template | meta@1 |
|---|---|
| Object shape | Kind with `ws.title`, `ws.sourceKind`, `ws.sourceRef` and each required property as a required string field |
| Allowed relation endpoints | One relation per relation kind with the union of its entries' kinds, plus a `ws.endpoint` node per entry |
| Required relation | `requiredRel` with cardinality `1..*` on the subject kind, plus a `ws.requirement` node holding object kind and scope |
| Required relation scope | A `ws:scope:<id>` node; the constraint `core.mandatory-scope-incomplete` requires every `ws.scope` to be declared complete |
| Forbidden cycle | `forbiddenCycle` constraint with the Rust rule id |
| Incompatible constraint | `incompatible` on `ws.activeConstraints`, whose boolean fields are the constraint names the template mentions |
| Required Rule Pack | A `ws.requiredPack` node |
| Thing Template | A `ws.thingTemplate` node |

`template.meta.world@1` also carries the compiled Rule Pack catalogue as `ws.compiledPack` nodes, mirroring `compiled_rule_pack_catalog()`.

`worldSnapshotToGraph(snapshot)` keeps object ids, kinds, parents and properties. Relations become links, and a relation's source kind becomes the link certainty. Things, Rule Pack pins, the purpose, the environment, theory claims and the active constraints become `ws.*` nodes. Purpose beneficiaries and outcomes, the environment model and claim references become links that world-core checks by target kind. Completeness declarations become declarations on `ws:scope:<id>`. The template's prefilled nodes are included, so every derivation ends in EDB facts. The graph is a set, so the loader records each duplicated id as a `ws.duplicate` node. Lost on load: relation ids and sources, moves, and `ws.` as a usable prefix for World kinds and relations, which the converter rejects.

`world.readiness@1` reproduces every world-core check the core packs do not cover under the Rust finding code. `toWorldFindings(readiness, snapshot)` folds core and world findings into world-core's `(ruleId, severity, objectIds)`. A key is a `blocker` if any engine finding behind it is an `error`, else `unknown`. Findings with no world-core code are returned as `unmapped`.

| world-core status | Engine |
|---|---|
| `ready` | `actionable` |
| `blocked` | not `actionable`, at least one `error` |
| `unknown` | not `actionable`, no `error`, at least one `missing` |

`buildable` is stricter than `ready`. A world-core object's properties are open, and a meta@1 kind declares only the required ones, so every other property is a `field.unknown` warning.

`test/fixtures/world/regen.mjs` builds `bropilot-query`, evaluates the eleven assistant snapshot fixtures and 37 single-change mutations of `assistant-valid` from `mutations.json`, and writes `expected/*.readiness.json`. `assistant-impact-evidence.json` holds evidence bindings, not a snapshot. `test/world.test.ts` requires the same `(ruleId, severity, objectIds)` set and the same status for every case, except these documented differences:

| Case | Engine | Why |
|---|---|---|
| An empty required property | Blocked by `core.shape-required-properties` | world-core tests key presence; the engine drops empty strings when it emits fields |
| An object of unknown kind with a Thing | Also `link.endpoint` on `ws.ofThing` | The link starts at a kind the relation does not list |
| A parent cycle | Blocked by `tree.cycle` | world-core does not check containment |
| A required relation whose endpoints exclude the subject kind | Form error `kind.relationUnsatisfiable`, no evaluation | world-core evaluates and reports a blocker per subject |

Untested edge cases where the two can differ: duplicate objects with different parents add `tree.multiParent`; a duplicated world object is one node, so `core.world-root` relies on `core.ids-unique`; an empty `worldId` or requirement field disables the rules that read it; and a relation with both endpoints missing is reported at both ends.

## Usage

```ts
import { checkTemplateForm, evaluate, loadTemplate, memoryStore } from "@bropilot/ontology-engine";

const template = loadTemplate(rawTemplate, memoryStore([rawBaseTemplate]));
const form = checkTemplateForm(template);          // { valid, findings, hash }
const readiness = evaluate(template, graph);        // throws TemplateFormError if the form is invalid
for (const f of readiness.findings) console.log(f.level, f.rule, f.subject, f.message, f.pack);
```

## Fact relations

Graph set: `graphTemplate/1`, `node(Id, Kind, Parent)` with `""` for roots, `field(Node, Field, Value)`, `fieldType(Node, Field, Type)`, `parent/2`, `link(From, Rel, To, Certainty)`, `known/1`, `ref(From, Via, To)`, `declared(Scope, Status)`, `provisional/1`, `evidence(Id, Subject, Kind)`.

Template set: `templateRef/1`, `kind/1`, `kindField(Kind, Field, Type, Required)`, `kindFieldEnum/3`, `kindParent/2`, `requiredField/2`, `requiredChild(Kind, Child, Min, Max)`, `requiredRel(Kind, Rel, Min, Max)`, `relation/1`, `relEndpoint(Rel, Side, Kind)`, `relCard(Rel, Dir, Min, Max)`, `relAcyclic/1`, `relInverse/2`, `relCertainty/2`, `forbiddenCycle/2`, `incompatible/4`, `incompatibleSize/2`, `exclusive/2`, `exactlyOne/4`, `completeScope/2`, `criterion/4`, `criterionGate/2`, `criterionHook/2`, `question/2`, `typeAccepts/2`.

Form set, used only by `meta@1`: includes `questionSliceKind/2`, `questionSliceRel/2` and `templateNodeLink/2`, so a slice or a prefilled node that names an unknown kind or relation is a form error.

The exact declarations are `EDB_DECLS`. An unbounded maximum is `-1`. Field values are encoded as `sym`: numbers and booleans as their string form, objects as canonical JSON, and each list element as its own `field` row. A link without `certainty` takes the relation's default, else `declared`.

Template rule packs run in their own evaluation after the core packs. They may read the relations above and relations they derive themselves, and they must `.decl` what they read. They output `violation(Rule, Subject, Severity)`, `missing(Rule, Subject)`, `warning(Rule, Subject)` or `semanticCandidate(Rule, Subject, Text)`.

## Readiness

Levels are `error`, `missing`, `warning`, `review`, `info` and `pass`; `review` and `pass` come only from judgment. Severity `hard` maps to `error`, `soft` to `warning` and `advisory` to `info`. `actionable` means no `error` or `missing` finding. `buildable` additionally requires no `warning`, no `review` and no semantic candidate without a confident judgment. Both are false when evaluation stops at `maxIterations` (`incomplete: true`).

## Tests

```sh
npm run test:engine
npx tsc -p packages/ontology-engine --noEmit
```
