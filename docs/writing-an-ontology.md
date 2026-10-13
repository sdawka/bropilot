# Writing an ontology for the engine

An ontology here is a `meta@1` template: kinds, fields, relations, constraints, and the criteria the engine judges content against. The engine applies the template's own criteria at every level: each node against its kind, each set of children against their parent's kind, each pair against what their parent says compatible children look like, and the whole against the root criteria. It also always runs its generic checks for a usable ontology. This guide covers how to write both halves so that a small decision model, seeing one bounded slice at a time, reaches the same verdict a careful reviewer would.

Reference: `packages/ontology-engine/README.md` ("Criteria from the ontology", "Semantic probes and providers", "Text quality").

## What the engine checks without being told

These run on every template and every graph, whatever the criteria say.

| Layer | Pack | What it checks |
|---|---|---|
| Template form | `meta@1` | Relations, parents, children, constraints and questions name declared kinds and relations; cardinalities are satisfiable; `extends` resolves without cycles; rule packs parse and stratify; questions map every answer; `criteria.minScoreRange` (error) and `criteria.tooLong` (warning, over 255 characters). An invalid template refuses to evaluate. |
| Structure | `metamodel@1`, `completeness@1`, `consistency@1` | Kinds and fields exist, required fields and child and relation cardinalities hold, forbidden cycles, incompatible values, exclusive relations, exactly-one choices. |
| Text | `text@1` | Blank required fields, short text, placeholder text, text equal to the id or another field, pattern mismatches. |
| Judgment | `semantic.probe@2` and the funnel | Whether a node is what its kind says, how concrete it is, whether it is testable, whether siblings can all hold, whether a parent's description summarises its children, and how two statements relate. The wording of each question comes from the criteria below. |

Whatever code can decide, code decides. Put it in fields, cardinalities, constraints or text rules, not in a criterion. A criterion is for what only reading the words can settle.

## Kinds

**Name each kind as a noun with an instance criterion.** `noun` is what a question calls a node of this kind. `instanceOf` says what makes a statement a genuine member, in one sentence that separates it from its neighbours: an outcome is a change in the world, not something the team delivers; a feature is user-facing functionality, not a capability independent of any screen. A model asked "is this a genuine outcome?" without that sentence answers on vibes.

**One statement per node.** A node's `description` is one claim, behaviour, rule or criterion. Several items in one node are reported as `instance.compound`, and they cannot be scored, tested or paired on their own. Use child nodes for parts and list fields for enumerations.

**Mark structural kinds `tangible: false`.** Sections, summaries and groupings exist to hold other nodes. Scoring them for concreteness only produces noise, because a good section heading is meant to be abstract. They still get `node.kind` and the set questions.

## Tangibility

`node.tangibility` scores a statement 0 to 4. It passes from 3 unless the kind sets `minScore`.

| Score | Meaning | What the kind needs |
|---|---|---|
| 0, empty | A slogan or filler; nothing to build or check. | |
| 1, abstract | An intent or quality without behaviour, actor, object or threshold. | |
| 2, partly concrete | The behaviour or object, with actor, trigger, threshold or scope left open. | Enough for a hypothesis: set `minScore: 2` on claim-like kinds. |
| 3, concrete | One behaviour or condition competent builders would build and check the same way. | The kind's `instanceOf` satisfied and its essentials named. |
| 4, grounded | Every actor, trigger, object and threshold is stated. | What `grounded` lists: for a feature, who uses it, the trigger and what the product does; for a rule, when it applies and what is allowed or forbidden. |

Write `grounded` as the list of things a level-4 statement names. It is appended to the level-4 option, so the model scores against your kind's definition of complete rather than a generic one.

## Testability

`testable` says what makes a statement of the kind checkable. It is added to `text.unmeasurable` for the kinds a template lists as `measurable`, and to `criterion.unfalsifiable` for the kinds listed as `criteria`.

- **Outcomes and indicators** need an indicator, a baseline, a target, a horizon and the source of the measurement.
- **Acceptance criteria and rules** need the situation or input, the expected observable result, and what counts as failing.
- **Hypotheses and claims** need the evidence that would support them and the evidence that would refute them.

When a kind has fields for these parts, require them in `completeness` and leave the criterion to judge whether the prose fills them meaningfully.

## Parents and their children

Every kind whose nodes have children is asked, when the template lists it in `sets`, whether its children can all hold at once (`set.allHold`), whether any two conflict (`set.inconsistent`), and whether its description summarises them (`parent.summary`). The parent kind owns the criteria for this:

- **`children`**: what the children of one such node must jointly satisfy. Say what they share and what would make two of them incompatible. For example: "Components of one screen are shown to the same person at the same time; their limits, states and actions must agree." Goals: parts must be achievable together by the same people. Outcomes: parts describe the same change for the same beneficiary within one horizon. Sections: parts describe one area of one system.
- **`summary`**: what the parent's own description must say about its children. For example, a feature's description states what its parts deliver together and claims nothing none of them provides. This turns "omits", "overclaims" and "stale" into checks against a stated obligation.
- **`pairs`**: what a compatible pair of children looks like. It words `pair.relation` when two children are compared. The engine attaches it to the child kinds the template places under the parent through `parents` or `completeness.children`, so declare containment where it is known.

**Root criteria** do the same for the whole. `rootCriteria.sections` states how the top-level sections fit together, for example "the purpose motivates the outcomes, the features serve those outcomes, and the rules constrain the features without contradicting the summary". `rootCriteria.terms` states how terms are used across sections, for example "a term keeps one meaning in every section, and no section names the same thing with another word".

## Relations that carry consistency obligations

Some relations say that two statements must be compatible. List them in `probePairs` so that their ends are asked `pair.relation`, and give them structural rules where code can decide.

| Relation | Obligation | Structural rule |
|---|---|---|
| `governs` | The rule and the thing it governs must not contradict or clash in scope. | Endpoint kinds. |
| `authorizedBy` | The operation must be permitted by the authorization it names, for the same actor and scope. | Typed endpoints; a required relation cardinality. |
| `dependsOn` | No circular dependency, and a dependency must be able to hold before its dependent does. | `forbiddenCycles` or `acyclic: true`. |

Relations that only say "related to" carry no obligation and should not be probed in pairs.

## Placeholders and deterministic text

Opt in with `textDefaults: {}` to catch TBD, TODO and similar on every `title` and `description`. Add `minWords` to fields that must state something, and `distinctFrom: ["id", "title"]` to descriptions that tend to repeat the title. These checks cost no model call; `instance.placeholder` is decided by `text.placeholder`, never asked of the model.

## Writing criteria that work

- One sentence, at most 255 characters, readable on its own. The engine inserts it as a sentence into a question stem.
- Say what holds, not what to avoid. Name the actors, objects and conditions of the domain.
- No examples drawn from the graph being judged, because they anchor the model on that content.
- A criterion that is absent costs nothing: the generic stem is sent unchanged.
- Kind criteria merge key by key through `extends`, so a base template can define the shared vocabulary and a child template can sharpen one key.

## Worked example

```ts
const template: TemplateInput = {
  id: "template.example.product", version: 1, meta: 1,
  kinds: {
    spec: {
      fields: [{ name: "title", type: "string" }],
      completeness: { fields: [], relations: [], children: [{ kind: "purpose", cardinality: "1" }] },
      criteria: { pairs: "Two sections of one spec are compatible when they describe the same product, audience and scope." },
    },
    purpose: {
      fields: [{ name: "title", type: "string", required: true }, { name: "description", type: "string", minWords: 6 }],
      criteria: {
        noun: "product purpose",
        instanceOf: "A purpose states the change the product exists to make, and for whom.",
        grounded: "It names who benefits and the change they would notice.",
        children: "Parts of one purpose must serve the same beneficiaries and the same change.",
        summary: "The purpose's description must name the beneficiaries and the change its parts elaborate.",
      },
    },
    outcome: {
      fields: [{ name: "title", type: "string", required: true }, { name: "description", type: "string" }],
      criteria: {
        noun: "outcome",
        instanceOf: "An outcome is a change in users' behaviour the product aims for, not something the team delivers.",
        grounded: "It names who changes, how, and how the change would be observed.",
        testable: "A testable outcome names an indicator, its baseline, its target, the horizon and the source of the measurement.",
      },
    },
    feature: {
      fields: [{ name: "title", type: "string", required: true }, { name: "description", type: "string" }],
      criteria: {
        noun: "feature",
        instanceOf: "A feature is a user-facing piece of functionality the product provides.",
        grounded: "It names who uses it, the trigger and what the product does.",
        children: "Rules of one feature apply to the same users and trigger; none may forbid or cap what another requires.",
        summary: "The feature's description must state what its rules deliver together and claim nothing none of them provides.",
        pairs: "Two rules of one feature are compatible when both can apply in the same session and neither restates the other.",
      },
    },
    rule: {
      fields: [{ name: "title", type: "string", required: true }, { name: "description", type: "string" }],
      parents: ["feature"],
      criteria: {
        noun: "business rule",
        instanceOf: "A rule is a constraint the product must always enforce.",
        grounded: "It names when it applies and what is allowed or forbidden.",
        testable: "A testable rule names when it applies and what a test would observe if it were broken.",
      },
    },
  },
  rootCriteria: {
    sections: "The purpose motivates the outcomes, and the features serve those outcomes without contradicting the purpose.",
    terms: "A term keeps one meaning in every section.",
  },
  textDefaults: {},
};

const probed = loadTemplate(withSemanticProbes(template, {
  measurable: ["outcome"], criteria: ["rule"], sets: ["feature", "purpose"], sections: true, purposeKinds: ["feature", "outcome"],
}));
```

With this template, a feature node with two rules is asked whether its rules can all hold "given" the feature's `children` sentence, and whether its description meets the `summary` sentence. Two of its rules are compared against `pairs`. An outcome is asked whether it is measurable with the five parts named. The spec root is asked whether its sections fit together as `rootCriteria.sections` says.

The shipped templates follow the same pattern: `PRODUCT_CRITERIA` and `PRODUCT_ROOT_CRITERIA` on `productSpec`, `ARTYFACT_CRITERIA` on `artyfactGenome`, and `WORLD_KIND_CRITERIA` attached by `worldTemplateSource` to the World object kinds.

## Checklist

- [ ] Every kind a person writes prose for has `noun` and `instanceOf`, and the `instanceOf` sentence separates it from its nearest neighbour kind.
- [ ] One statement per node; parts are child nodes, enumerations are list fields.
- [ ] Structural kinds are `tangible: false`; hypothesis-like kinds have `minScore: 2`.
- [ ] `grounded` lists what a level-4 statement of the kind names.
- [ ] Measurable and falsifiable kinds have `testable`, and are listed in `measurable` or `criteria`.
- [ ] Every parent kind used as a set has `children` and `summary`; parents whose children are compared have `pairs`, with containment declared through `parents` or `completeness.children`.
- [ ] The template has `rootCriteria.sections` and `rootCriteria.terms` when it has sections.
- [ ] Relations with a consistency obligation are listed in `probePairs` and have structural rules where code can decide.
- [ ] `textDefaults` is on, and descriptions that must say something have `minWords`.
- [ ] Anything code can decide is a field, cardinality, constraint or text rule, not a criterion.
- [ ] `checkTemplateForm` reports no errors and no `criteria.tooLong` warnings.
