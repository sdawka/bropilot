# @bropilot/ontology-engine

A template-independent ontology engine. A template declares kinds, relations, constraints, criteria, rule packs and questions against the versioned meta-schema `meta@1`. The engine checks that the template is well formed, then evaluates an instance graph against it and reports readiness with a derivation for every finding. The design is `docs/ontology-engine-library.md`.

TypeScript ESM. The only runtime dependency is `zod`. Hashing is synchronous, so the same code runs in Node and Workers.

## What exists

| Module | Contents |
|---|---|
| `src/rules/` | The Datalog engine moved verbatim from `@artyfact/rules`; see `src/rules/README.md` for the dialect. |
| `src/meta/` | `meta@1` zod schemas, cardinality grammar (`1`, `0..1`, `1..*`, `0..5`), `loadTemplate` with `extends` resolved through a `TemplateStore`, `templateHash`, `instantiateNodes` for `$self`, and `checkTemplateForm`. |
| `src/graph/` | The canonical JSON graph (`template`, `nodes`, `links`, `declarations`, `evidence`), `parseGraph` and `graphHash`. |
| `src/evaluate/` | `toFacts`, the engine-owned packs `metamodel@1`, `completeness@1`, `consistency@1` and `meta@1`, `evaluate` returning `Readiness`, `diff` and `diffFindings`. |

The judgment layer (`judge/`) and the YAML directory adapter are not built yet. `Readiness.judgments` is always zero and semantic candidates are reported as `info` findings.

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

The exact declarations are `EDB_DECLS`. An unbounded maximum is `-1`. Field values are encoded as `sym`: numbers and booleans as their string form, objects as canonical JSON, and each list element as its own `field` row. A link without `certainty` takes the relation's default, else `declared`.

Template rule packs run in their own evaluation after the core packs. They may read the relations above and relations they derive themselves, and they must `.decl` what they read. They output `violation(Rule, Subject, Severity)`, `missing(Rule, Subject)`, `warning(Rule, Subject)` or `semanticCandidate(Rule, Subject, Text)`.

## Readiness

Severity `hard` maps to `error`, `soft` to `warning` and `advisory` to `info`. `actionable` means no `error` or `missing` finding. `buildable` additionally requires no `warning` and no open semantic candidate. Both are false when evaluation stops at `maxIterations` (`incomplete: true`).

## Tests

```sh
npm run test:engine
npx tsc -p packages/ontology-engine --noEmit
```
