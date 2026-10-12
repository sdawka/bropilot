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
