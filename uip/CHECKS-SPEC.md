# CHECKS-SPEC: Clef checks the ontology (solidity, completeness, consistency)

Status: spec, 2026-10-04. Extends SPEC.md §6 (System One contract) and §10 (shared types). Read with
`research/clef-system-one.md`. Every string in `code` below is literal: implement it verbatim.

## 1. Principle

- **Code decides structure and never asks Clef**: edge from/to legality (`edge-shape`), needs
  cardinality (which `needs[]` are unmet), orphans, template order (`inv-unlock`), exact rule-condition
  ↔ test-condition string matches, self-loops, duplicate (src,dst,type) edges, `evidence.props.verdict`
  vs its edge type, a feature with `stages` but no flow, a term with no description.
- **Clef decides only what needs reading the words**: whether an edge's claimed relation holds between
  these two texts (solidity), whether a node's text implies a relation the graph lacks (completeness),
  whether two statements that must agree do agree (consistency).
- One question = one judgement, everything it reads is in its own `instructions`. The shared `state`
  is a constant (lfp lesson: a shared state full of other pairs took consolidate-pair from 54/54 to 0/54).
- Every Clef question has a deterministic fake (§3.6) and a band (act ≥ threshold, offer ≥ .40, else ask).
  A fallback is never a failure; a fake never raises an alarm it cannot justify (it says `unknown`).
- Every result is cached per `sha1(checkId, subjects, literal inputs, model, CHECKS_VERSION)`; editing a
  subject's words changes the inputs, so the cache misses by construction.
- Checks never change the graph. A repair is an Effect list that goes through the commit gate (§4 `repairMode`).

## 2. Check catalog

### 2.1 Literal helpers (used by every entry; `src/checks/phrasing.ts`)
```ts
export const CHECKS_VERSION = 1;
export const CHECK_STATE = 'Items from one product description. Every question carries the items it is about.';
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' / ').trim();
export const clip = (s: string, n: number) => (s = oneLine(s), s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const l = (kind: string) => kindLabel(kind).toLowerCase();            // 'use case', 'bet', 'capability'
const T = (n: Node) => `the ${l(n.kind)} "${clip(n.title, 120)}"`;
const D = (n: Node) => n.description ? `\n  ${kindLabel(n.kind)} description: "${clip(n.description, 240)}"` : '';
const F = (n: Node, key: string) => n.props?.[key] ? `\n  ${fieldLabel(n.kind, key)}: "${clip(n.props[key], 120)}"` : '';
const hintOf = (type: string) => edgeTypeById[type].hint.replace(/\s*STUB\.\s*$/, '');
const conds = (rule: Node) => conditionsOf(rule).length ? `\n    conditions: "${conditionsOf(rule).join(' / ')}"` : '';
// conditionsOf = lfp checks.ts: description lines, else [title]. Ported to src/checks/phrasing.ts.
```
Generic verdict rules (`src/checks/resolve.ts`):
```ts
conf(noul p) = |p − .5|·2;  band = bandFor(conf, threshold)            // s1/decisionConfig.ts
nounVerdict(p, t, polarity: 'yes-good' | 'yes-bad') =
  band === 'ask' ? 'unknown' : band === 'offer' ? 'weak'
  : (p >= .5) === (polarity === 'yes-good') ? 'solid' : 'broken'
choice/score: band from the answer's confidence; the entry says which option means what.
multi-question units: confidence = min over answers; band from that; verdict from the entry's rollup.
```
`SEMANTIC = ['motivates','serves','satisfies','has','implements','realises','governs','defines','references','triggers','verifies','monitors','measures','supports','refutes','carries','emits','combines']`.
Never asked about (code only): `contains, exposes, uses, hosts, targets, reports`.
Edge routing (each SEMANTIC edge goes to exactly one solidity check, first match wins):
`satisfies→sol-satisfies; implements & src∈{agent,flow,screen} & dst∈{capability,feature}→sol-implements;
verifies→sol-verifies; supports|refutes→sol-evidence; monitors→sol-monitors; realises→sol-realises;
references & src=hypothesis & dst=metric→sol-bet-metric; motivates & src=purpose→(none: cmp-purpose-outcome);
otherwise→sol-edge`. Edge subjects are `edge:<id>` followed by src id and dst id.

Repairs are `Repair` values (§6 types). Labels below are literal; `{x}` is the node title.
`question` repairs open the existing QuestionStub in chat with that text; `mark-reviewed` pins the result
to `solid`/`reviewed` until its inputs change.

### 2.2 Solidity
```ts
{ id: 'sol-edge', family: 'solidity',
  scope: "edges.where(routed to 'sol-edge')  // motivates(problem→outcome), serves, has, implements(other), governs, defines, references(other), triggers, measures, carries, emits, combines",
  state: 'CHECK_STATE', question: { type: 'noul',
    instructions: `In a product description, "${et.label}" means: ${hintOf(e.type)}\nClaim: ${T(src)} ${et.label} ${T(dst)}.${D(src)}${D(dst)}\nDoes the claim hold, judging only from these words?`,
    criteria: { true: { definition: `The words show that the ${l(src.kind)} ${et.label} the ${l(dst.kind)}, in the sense defined.`, examples: [EX[e.type].yes] },
                false: { definition: 'The words do not show it: the two items are about different things, or the relation is a different one.', examples: [EX[e.type].no] } } },
  threshold: 0.60, band: "nounVerdict(p, t, 'yes-good')", verdict: ['solid','weak','broken','unknown'], findings: ['holds','doubtful','does-not-hold','unclear'],
  render: 'edge pill (column row, node-pane chip), node-pane Checks band if weak|broken, audit row',
  repair: "weak|broken → sol-retype pass; then [remove-edge 'Remove this link'], [retype-edge 'Change to {label}' per retype option ≥ .25], [mark-reviewed 'It is right']",
  fallback: 'fakeNoul(src.title+desc, dst.title+desc)' },
```
`EX` (one line each, `yes` / `no`; neutral clinic domain, never a seed title):

| type | yes | no |
|---|---|---|
| motivates | `Problem "Patients forget appointments" motivates outcome "Fewer missed appointments".` | `Problem "Patients forget appointments" does not motivate outcome "Faster checkout at the desk".` |
| serves | `Capability "Online booking" serves audience "Clinic patients".` | `Capability "Payroll export" does not serve audience "Clinic patients".` |
| has | `Audience "Clinic patients" has problem "Patients forget appointments".` | `Audience "Clinic receptionist" does not have problem "Patients forget their medication".` |
| implements | `Flow "Book a slot" implements task "Add slot picker".` | `Flow "Book a slot" does not implement task "Rotate API keys".` |
| governs | `Rule "A slot has at most one appointment" governs thing "Appointment".` | `Rule "A slot has at most one appointment" does not govern thing "Invoice".` |
| defines | `Term "No-show" defines event "Appointment missed".` | `Term "Copay" does not define thing "Appointment".` |
| references | `Assumption "Patients read SMS within an hour" references bet "Reminders cut no-shows".` | `Assumption "Doctors like dark mode" does not reference bet "Reminders cut no-shows".` |
| triggers | `Event "Appointment booked" triggers module "Reminder scheduler".` | `Event "Invoice paid" does not trigger module "Reminder scheduler".` |
| measures | `Metric reading "No-show rate: 7% in May" measures metric "No-show rate".` | `Usage event "Opened pricing page" does not measure flow "Book a slot".` |
| carries | `Interface "Bookings API" carries thing "Appointment".` | `Interface "Bookings API" does not carry thing "Payroll run".` |
| emits | `Interface "Bookings API" emits event "Appointment booked".` | `Interface "Bookings API" does not emit event "Invoice paid".` |
| combines | `Goal "No-shows under 5% and NPS over 40" combines metric "No-show rate".` | `Goal "No-shows under 5%" does not combine metric "Signup conversion".` |

```ts
{ id: 'sol-satisfies', family: 'solidity', scope: "edges.where(type == 'satisfies')  // capability|feature → problem|usecase",
  question: dst.kind === 'usecase'
   ? { type: 'noul', instructions: `Does the ${l(src.kind)} "${src.title}" help someone get the use case "${dst.title}" done?${D(src)}${D(dst)}`,
       criteria: { true: { definition: `Someone doing this use case would use this ${l(src.kind)} to get it done.`, examples: ['Capability "Scan a receipt" and use case "File this month\'s expenses".'] },
                   false: { definition: `The ${l(src.kind)} plays no part in getting this use case done.`, examples: ['Capability "Scan a receipt" and use case "Invite a teammate".'] } } }
   : { type: 'noul', instructions: `Does the ${l(src.kind)} "${src.title}" remove or reduce the problem "${dst.title}"?${D(src)}${D(dst)}`,
       criteria: { true: { definition: `Having this ${l(src.kind)} removes or reduces this obstacle for the people who face it.`, examples: ['Capability "Scan a receipt" and problem "Typing expenses by hand takes too long".'] },
                   false: { definition: `The ${l(src.kind)} does not touch this obstacle, even when both are about the same area.`, examples: ['Capability "Scan a receipt" and problem "Reports are hard to share with the accountant".'] } } },
  threshold: 0.60, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge', repair: 'as sol-edge', fallback: 'fakeNoul' },   // phrasing = lfp link-answer

{ id: 'sol-implements', family: 'solidity', scope: "edges.where(type == 'implements' && src.kind in ['agent','flow','screen'] && dst.kind in ['capability','feature'])",
  question: { type: 'noul', instructions: `Is ${T(src)} a concrete part of how ${T(dst)} is delivered: doing it, showing it or running it?${D(src)}${D(dst)}`,
    criteria: { true: { definition: 'The first item exists to carry out the second: someone using it is using the second.', examples: ['Screen "Receipt camera" implements capability "Scan a receipt".'] },
                false: { definition: 'The first item serves a different capability or feature, even in the same area.', examples: ['Screen "Team settings" does not implement capability "Scan a receipt".'] } } },
  threshold: 0.60, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge', repair: 'as sol-edge', fallback: 'fakeNoul' },

{ id: 'sol-verifies', family: 'solidity', scope: "edges.where(type == 'verifies')  // test → rule",
  question: { type: 'noul', instructions: `Does the test "${src.title}" check a condition of the rule "${dst.title}"?${F(src,'condition')}${conds(dst)}`,
    criteria: { true: { definition: 'Running the test would show whether the rule holds in at least one case: it passes when the rule is obeyed and fails when it is broken.', examples: ['Test "Double booking is rejected" verifies rule "A slot has at most one appointment".'] },
                false: { definition: 'The test checks something else; the rule could be broken and the test still pass.', examples: ['Test "Login page loads" does not verify rule "A slot has at most one appointment".'] } } },
  threshold: 0.70, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge + rule row in node pane', repair: 'as sol-edge', fallback: 'fakeNoul(test.title + condition, rule.title + conditions)' },

{ id: 'sol-evidence', family: 'solidity', scope: "edges.where(type in ['supports','refutes'])  // evidence → hypothesis",
  question: { type: 'choice', instructions: `What does the evidence "${src.title}" say about the bet "${dst.title}"?${D(src)}${D(dst)}`,
    criteria: { supports: 'It makes the bet more likely to be true: what the bet predicts was observed.',
                refutes: 'It makes the bet less likely: the opposite of what the bet predicts was observed.',
                unrelated: 'It is about something the bet does not itself claim, such as an assumption behind it or a different feature.' } },
  threshold: 0.70, band: 'band(choice.confidence)', verdict: "act & choice == e.type → solid; act & other → broken; offer → weak; ask → unknown", findings: ['agrees','opposite','unrelated','unclear'],
  render: 'as sol-edge', repair: "opposite → [retype-edge 'Change to {choice}'] first; unrelated → [question 'Is \"{evidence}\" about the bet or about the assumption \"{a}\"?' for each assumption a —references→ bet], [remove-edge]; always [mark-reviewed]",
  fallback: "overlap(evidence, bet) ≥ 1 ? choice e.type @ .50 : 'unrelated' @ .50" },

{ id: 'sol-monitors', family: 'solidity', scope: "edges.where(type == 'monitors')  // metric → outcome",
  question: { type: 'noul', instructions: `If the outcome "${dst.title}" happened for real, would the metric "${src.title}" show it?${F(dst,'metric')}${D(dst)}`,
    criteria: { true: { definition: 'The number moves when the outcome is reached and stays put when it is not.', examples: ['Metric "No-show rate" monitors outcome "Fewer missed appointments".'] },
                false: { definition: 'The number tracks something else, or only a side effect of the outcome.', examples: ['Metric "Signup conversion" does not monitor outcome "Fewer missed appointments".'] } } },
  threshold: 0.60, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge', repair: "as sol-edge + [question 'How will you know \"{outcome}\" happened? Name one metric.']", fallback: 'fakeNoul' },

{ id: 'sol-realises', family: 'solidity', scope: "edges.where(type == 'realises')  // codebase|infrastructure|practice → infra|module|protocol|system",
  question: { type: 'noul', instructions: `Is ${T(src)}${src.props?.codeRef ? ` (at ${lastTwoPathSegments(src.props.codeRef)})` : ''} where ${T(dst)} actually exists in reality?${D(src)}${D(dst)}`,
    criteria: { true: { definition: 'This code, infrastructure or practice is the real-world form of the item: change it and the item changes.', examples: ['Code "billing-service (Go)" realises module "Billing".'] },
                false: { definition: 'It is a different part of reality; the item lives elsewhere or nowhere yet.', examples: ['Code "marketing site" does not realise module "Billing".'] } } },
  threshold: 0.60, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge', repair: 'as sol-edge', fallback: 'fakeNoul' },

{ id: 'sol-bet-metric', family: 'solidity', scope: "edges.where(type == 'references' && src.kind == 'hypothesis' && dst.kind == 'metric')",
  question: { type: 'noul', instructions: `Would the metric "${dst.title}" show whether the bet "${src.title}" holds?`,   // lfp link-answer betMetric, verbatim
    criteria: { true: { definition: 'The metric measures whether the bet holds: if the bet is right, this number moves.', examples: ['Bet "Reminders cut missed appointments" and metric "No-show rate".'] },
                false: { definition: 'The metric measures something the bet does not claim to change.', examples: ['Bet "Reminders cut missed appointments" and metric "Signup conversion".'] } } },
  threshold: 0.55, band: "nounVerdict 'yes-good'", verdict: 'as sol-edge', render: 'as sol-edge', repair: "as sol-edge + [question 'How would you know \"{bet}\" holds? Name one metric.']", fallback: 'fakeNoul' },

{ id: 'sol-retype', family: 'solidity', scope: 'second pass: every sol-* result with verdict weak|broken (one unit per edge)',
  question: { type: 'choice', instructions: `${cap(T(src))} and ${T(dst)} are linked as "${et.label}", which may be wrong. Which relation fits them best? Pick none if they should not be linked at all.${D(src)}${D(dst)}`,
    criteria: { keep: `Keep "${et.label}": ${hintOf(e.type)}`,
                ...Object.fromEntries(ALT.map((a) => [a.id, `${a.label}: ${hintOf(a.id)}`])),     // ALT = EDGE_TYPES where a.id != e.type && a.from.includes(src.kind) && a.to.includes(dst.kind) && a.id in SEMANTIC
                none: 'They should not be linked' } },
  threshold: 0.65, band: 'band(choice.confidence)', verdict: 'none (merges into the parent result: replaces its repairs, never its verdict)', findings: ['keep','retype','unlink','unclear'],
  render: "parent's pill popover: 'fits better: {label} ({conf})' or 'should not be linked ({conf})'",
  repair: "act & alt → [retype-edge 'Change to {alt}'] first; act & none → [remove-edge 'Remove this link'] first; act & keep → [mark-reviewed 'It is right'] first; offer → top two as buttons",
  fallback: "'keep' @ .30 (ask band: no retype suggestion)" },
```

### 2.3 Completeness
```ts
{ id: 'cmp-need', family: 'completeness', scope: 'nodes × kind.needs where code finds the need unmet (store/traverse.ts unmetNeeds)',
  // CAND = nodes of need.produces ?? (other end of need.edge), not self, not already linked by need.edge, ranked by overlap(tokens(title+desc)), ≤ 12. CAND empty → code result, no question.
  question: { type: 'choice', instructions: `${cap(T(n))} needs a "${need.edge}" link: ${need.ask.replace('{title}', n.title)}\nWhich of these ${l(produces)} items is it? Pick none if none of them fits.${D(n)}`,
    criteria: { ...Object.fromEntries(CAND.map((c) => [c.id, `${clip(c.title, 80)}${c.description ? ` — ${clip(c.description, 80)}` : ''}`])), none: 'None of these; a new one is needed' } },
  threshold: 0.65, band: 'band(choice.confidence)', verdict: "always 'broken' (the gap is a code fact); band picks the primary repair", findings: ['link-candidate','missing'],
  render: 'node-pane Checks band "Missing", column badge, audit row; replaces the plain NeedsList line when a result exists',
  repair: "act & cand → [add-edge 'Link to \"{cand}\"'] first; act & none or CAND empty → [question need.ask] first; offer → add-edge for top 3 by probability + question; always [mark-reviewed 'Not needed here']",
  fallback: "top overlap ≥ 1 → that candidate @ .70; else none @ .30" },

{ id: 'cmp-problem-audience', family: 'completeness',
  scope: "pairs(problem p, audience a) where !edge(a,'has',p) && (p has no audience || overlap(tokens(a.title), tokens(p.title + p.description)) ≥ 1)",
  question: { type: 'noul', instructions: `Is ${T(p)} a problem that the audience "${a.title}" has?${D(p)}${D(a)}`,
    criteria: { true: { definition: 'The words name this audience or clearly describe its situation.', examples: ['Audience "Clinic patients" and problem "Patients forget appointments".'] },
                false: { definition: 'The problem belongs to someone else.', examples: ['Audience "Clinic receptionist" and problem "Patients forget their medication".'] } } },
  threshold: 0.55, band: "nounVerdict(p, t, 'yes-bad')", findings: ['implied','not-implied','unclear'], render: "problem's node pane 'Missing', audit row",
  repair: "[add-edge 'Link \"{audience}\" has \"{problem}\"'], [mark-reviewed 'Not theirs']", fallback: 'fakeNoul(p, a)' },

{ id: 'cmp-outcome-metric', family: 'completeness', scope: "outcomes with no incoming 'monitors'",
  question: { type: 'choice', instructions: `Which of these metrics would show that the outcome "${o.title}" happened?${F(o,'metric')}${D(o)}\nPick none if none of them would show it.`,
    criteria: { ...Object.fromEntries(METRICS.map((m) => [m.id, clip(m.title, 80)])), none: 'None of these' } },   // METRICS = all metric nodes, ranked by overlap, ≤ 12; empty → code result 'missing'
  threshold: 0.60, findings: ['implied','missing'], verdict: "act & metric → broken 'implied'; act & none → broken 'missing'; offer → weak; ask → unknown",
  render: "outcome node pane 'Missing', column badge on Outcomes, audit row",
  repair: "implied → [add-edge '\"{metric}\" monitors \"{outcome}\"']; missing & props.metric → [add-node 'Add metric \"{props.metric}\"' + monitors edge]; missing → [question 'How will you know \"{outcome}\" happened? Name one metric.']",
  fallback: 'fakeChoice(o.title + props.metric)' },

{ id: 'cmp-interface-carries', family: 'completeness',
  scope: "pairs(interface i, thing t) where !edge(i,'carries',t) && (i has no carries || overlap(tokens(t.title), tokens(i.title+in+out+desc)) ≥ 1); ≤ 12 per interface",
  question: { type: 'noul', instructions: `Does a payload entering or leaving the interface "${i.title}" contain or derive from the thing "${t.title}"?${F(i,'in')}${F(i,'out')}${D(i)}`,
    criteria: { true: 'The payload is this thing or is built from it.', false: 'The payload has nothing of this thing in it.' } },
  threshold: 0.55, band: "nounVerdict 'yes-bad'", findings: ['implied','not-implied','unclear'], render: "interface node pane 'Missing', audit row",
  repair: "[add-edge '\"{interface}\" carries \"{thing}\"'], [mark-reviewed 'Not carried']", fallback: 'fakeNoul' },

{ id: 'cmp-flow-screen', family: 'completeness',
  scope: "pairs(flow f, screen s) where !edge(f,'uses',s) && (f uses no screen || overlap(tokens(s.title), tokens(f.title+steps)) ≥ 1); ≤ 12 per flow",
  question: { type: 'noul', instructions: `Does someone following the flow "${f.title}" see or use the screen "${s.title}"?${F(f,'steps')}${D(f)}`,
    criteria: { true: 'A step of the flow happens on this screen.', false: 'No step of the flow happens on this screen.' } },
  threshold: 0.55, band: "nounVerdict 'yes-bad'", findings: ['implied','not-implied','unclear'], render: "flow node pane 'Missing', audit row",
  repair: "[add-edge '\"{flow}\" uses \"{screen}\"'], [mark-reviewed 'Not on this flow']", fallback: 'fakeNoul' },

{ id: 'cmp-purpose-outcome', family: 'completeness', scope: 'pairs(the purpose node, every outcome)',
  question: { type: 'noul', instructions: `Is reaching the outcome "${o.title}" part of what the purpose "${pu.title}" is for?${D(pu)}${D(o)}`,
    criteria: { true: 'The outcome is one of the real-world effects the purpose names or directly implies.', false: 'The outcome is beside the purpose: reaching it would not advance what the system is for.' } },
  threshold: 0.60, findings: ['on-purpose','implied','off-purpose','unclear'],
  verdict: "linked & yes(act) → solid; linked & no(act) → broken 'off-purpose'; unlinked & yes(act) → broken 'implied'; unlinked & no(act) → weak 'off-purpose'; offer → weak; ask → unknown",
  render: 'Basics column badge, purpose node pane, project home under Purpose, audit row',
  repair: "implied → [add-edge 'Purpose motivates \"{outcome}\"']; off-purpose → [question 'Is \"{outcome}\" part of the purpose? If not, should it go?'], linked → [remove-edge]; [mark-reviewed]", fallback: 'fakeNoul(pu, o)' },
```

### 2.4 Consistency
```ts
{ id: 'con-rule-pair', family: 'consistency', scope: "things with ≥ 2 incoming 'governs' from rules: every unordered rule pair, by id, ≤ 15 pairs per thing",
  question: { type: 'noul', instructions: `Can both rules hold at the same time for the ${l(t.kind)} "${t.title}"?\n  Rule A: "${a.title}"${conds(a)}\n  Rule B: "${b.title}"${conds(b)}`,
    criteria: { true: 'Both can hold together; obeying one never breaks the other.', false: 'They conflict: there is a case where obeying one rule breaks the other.' } },
  threshold: 0.75, band: "nounVerdict 'yes-good'", findings: ['compatible','tension','conflict','unclear'],   // weak → 'tension'
  render: 'both rules\' node panes "Disagreements", thing node pane, audit row',
  repair: "[question 'Rule \"{a}\" and rule \"{b}\" conflict on \"{t}\". Which one wins, or how do they combine?'], [mark-reviewed 'They agree']", fallback: 'p = .50 (unknown)' },

{ id: 'con-bet-evidence', family: 'consistency', scope: "hypotheses with ≥ 1 incoming 'supports' or 'refutes'  // lead asked 'both'; ≥1 also catches a stale verdict field",
  question: { type: 'score', instructions: `Taken together, what does this evidence say about the bet "${h.title}"?\n${EV.map((e) => `  - "${clip(e.title, 120)}"${e.description ? `: ${clip(e.description, 160)}` : ''}`).join('\n')}`,   // no edge types: words only
    criteria: ['refuted: taken together, the evidence shows the bet is wrong', 'contested: the evidence points both ways or is too thin to call', 'supported: taken together, the evidence shows the bet is right'] },
  threshold: 0.70, findings: ['supported','contested','refuted','unrecorded','contradicts-record'],
  verdict: "rec = h.props.verdict ?? 'open'; act & score matches rec → solid; act & rec == 'open' → weak 'unrecorded'; act & score opposite rec → broken 'contradicts-record'; act & contested & rec != open → weak; offer → weak; ask → unknown",
  render: 'bet node pane band, Bets column badge, audit row, chat',
  repair: "[update-node 'Set verdict to {score}' props.verdict], [mark-reviewed]", fallback: 'edges all supports → 2, all refutes → 0, mixed → 1, @ .75' },

{ id: 'con-outcome-metric', family: 'consistency', scope: "pairs(outcome o with props.metric, metric m —monitors→ o)",
  question: { type: 'noul', instructions: `The outcome "${o.title}" states its success metric as "${o.props.metric}". Does the linked metric "${m.title}" measure that same thing?`,
    criteria: { true: 'Same measure, or one directly computed from the other.', false: 'A different measure; the two would not move together.' } },
  threshold: 0.60, band: "nounVerdict 'yes-good'", findings: ['same','mismatch','unclear'], render: 'outcome node pane, audit row',
  repair: "[update-node 'Use \"{metric}\" as the success metric' props.metric = m.title], [question 'Which is the real success metric for \"{outcome}\": \"{field}\" or \"{metric}\"?'], [mark-reviewed]", fallback: 'fakeNoul(props.metric, m.title)' },

{ id: 'con-test-case', family: 'consistency', scope: "rules with ≥ 1 incoming 'verifies'; one question per verifying test (slot = test id)",
  question: { type: 'choice', instructions: `Which case of the rule "${r.title}" does the test "${t.title}" check?${conds(r)}${F(t,'condition')}`,
    criteria: { pos: 'The positive case: something the rule allows succeeds.', neg: 'The negative case: something the rule forbids is rejected.',
                both: 'Both: the test checks an allowed case and a forbidden one.', neither: 'Neither: the test does not exercise this rule.' } },
  threshold: 0.70, findings: ['both','pos-only','neg-only','untested'],
  verdict: "rollup over answers: pos ∪ neg covered → solid; one side → weak 'pos-only'|'neg-only'; all neither → broken 'untested'; then band of min confidence caps it (offer → weak, ask → unknown)",
  render: 'rule node pane (next to its Tests field), Rules column badge, audit row',
  repair: "[question '\"{rule}\" has no {missing} test. What should be {missing==neg ? \"rejected\" : \"allowed\"} to prove it?'], [update-node 'Set tests to \"{P} pos / {N} neg\"' when props.tests differs], [mark-reviewed]",
  fallback: "/\\b(reject|refus|never|cannot|fails?|denied|blocked|invalid|over)/i on test title → neg, else pos, @ .75" },

{ id: 'con-feature-stages', family: 'consistency', scope: "features with props.stages and ≥ 1 flow (feature —has→ flow ∪ flow —implements→ feature); one question per stage; 'all' = LIFECYCLE_STAGES",
  question: { type: 'noul', instructions: `The feature "${f.title}" claims to act at the "${stage}" stage of the customer lifecycle. Does any of its flows happen at that stage?\n  Flows: ${FL.map((x) => `"${clip(x.title, 80)}"`).join(', ')}`,
    criteria: { true: 'At least one flow is something a person does at that stage.', false: 'None of the flows happens at that stage.' } },
  threshold: 0.55, findings: ['covered','uncovered','unclear'], verdict: "all yes → solid; some no(act) → weak 'uncovered: {stages}'; all no(act) → broken; band of min caps it",
  render: 'feature node pane next to Lifecycle stages, audit row',
  repair: "[question 'What does \"{feature}\" do at the {stage} stage? One flow per line.'] per uncovered stage, [update-node 'Drop {stages} from stages'], [mark-reviewed]",
  fallback: 'STAGE_WORDS[stage] ∩ tokens(flow titles) ≠ ∅ → .86 else .35; use → .72 if any flow' },
// STAGE_WORDS = { awareness: ['landing','blog','post','launch','ad','seo'], acquisition: ['signup','sign','trial','pricing','lead','demo'], onboarding: ['onboard','first','setup','import','connect','welcome'], use: [], support: ['help','support','ticket','faq','doc'], retention: ['remind','digest','weekly','renew','return'], advocacy: ['share','invite','refer','review'], 'end-of-life': ['export','delete','cancel','archive'] }

{ id: 'con-dup-title', family: 'consistency', scope: 'pairs within one non-singular kind where jaccard(tokens) ≥ .5 or containsPhrase(a.title, b.title)',
  question: { type: 'noul', instructions: `Do these two titles name the same thing?\n${kindLabel(k)} "${a.title}" vs. ${kindLabel(k)} "${b.title}"${D(a)}${D(b)}`,   // lfp find-contradictions, verbatim
    criteria: { true: 'Same thing', false: 'Different things' } },
  threshold: 0.80, band: "nounVerdict 'yes-bad'", findings: ['duplicate','distinct','unclear'], render: 'both node panes, column badge, audit row',
  repair: "[merge-nodes 'Merge \"{b}\" into \"{a}\"'], [mark-reviewed 'They are different']", fallback: 'jaccard ≥ .8 → .90; ≥ .5 → .72; else .35' },

{ id: 'con-summary', family: 'consistency', scope: 'the summary node, when purpose and ≥ 1 outcome exist',
  question: { type: 'noul', instructions: `Is everything the summary says consistent with the purpose and the outcomes below?\n  Summary: "${clip(s.title + ' ' + (s.description ?? ''), 600)}"\n  Purpose: "${clip(pu.title, 200)}"\n  Outcomes: ${OUT.map((o) => `"${clip(o.title, 100)}"`).join(', ')}`,
    criteria: { true: 'Consistent: the summary may add detail but contradicts none of them.', false: 'The summary says something one of them contradicts, or describes a different product.' } },
  threshold: 0.75, band: "nounVerdict 'yes-good'", findings: ['consistent','contradicts','unclear'], render: 'project home under Summary, Basics badge, audit row',
  repair: "[question 'The summary disagrees with the purpose or outcomes. Rewrite it?'] (re-opens q-summary), [mark-reviewed]", fallback: 'p = .50 (unknown)' },

{ id: 'con-term-usage', family: 'consistency', scope: 'terms with a description; usages = ≤ 5 non-term nodes (by id) whose title or description containsPhrase(term.title); one question per usage (slot = node id)',
  question: { type: 'noul', instructions: `The glossary defines "${term.title}" as: "${clip(term.description, 240)}". Is "${term.title}" used with that meaning in ${T(u)}?${D(u)}`,
    criteria: { true: 'Used with the defined meaning.', false: 'Used with a different meaning, so either the definition or this wording should change.' } },
  threshold: 0.65, findings: ['consistent','drift','unclear'], verdict: "all yes(act) → solid; any no(act) → broken 'drift'; band of min caps it", render: 'term node pane, Vocabulary badge, audit row',
  repair: "[question '\"{node}\" uses \"{term}\" differently from the glossary. Reword it, or change the definition?'] per drifting node, [mark-reviewed]", fallback: 'p = .50 (unknown)' },
```
`fakeNoul(a, b)`: `o = overlap(tokens(a), tokens(b))` (s1/text.ts); `p = o ≥ 2 ? .86 : o === 1 ? .72 : .35`.
`fakeChoice(text, options)`: the option with the most overlap; `≥ 2` and unique → `.75`, `1` → `.50`, `0` → `none @ .20`; other options share the rest equally.

### 2.5 Worked examples (answers are plausible, not measured)
All requests carry `state: "Items from one product description. Every question carries the items it is about."`.
Rendered lines are the audit row text: `<dots> <check label> · <evidence> · <first repair>`.

**E1 sol-edge, ledgerly e22** (goal combines metric)
```json
{"sol-edge|edge:e22,goal-median-days-to-paid-under-14-by-end-of,metric-forecast-error-at-30-days": {"type":"noul",
 "instructions":"In a product description, \"combines\" means: Goal combines metrics.\nClaim: the goal \"Median days-to-paid under 14 by end of Q2\" combines the metric \"Forecast error at 30 days\".\nDoes the claim hold, judging only from these words?",
 "criteria":{"true":{"definition":"The words show that the goal combines the metric, in the sense defined.","examples":["Goal \"No-shows under 5% and NPS over 40\" combines metric \"No-show rate\"."]},"false":{"definition":"The words do not show it: the two items are about different things, or the relation is a different one.","examples":["Goal \"No-shows under 5%\" does not combine metric \"Signup conversion\"."]}}}}
```
Answer `{"type":"noul","noul":0.08}` → conf .84 ≥ .60, no → **broken**. Retype pass options `keep | references | none` → `none` .71.
`● ○ ○ Link holds? · "Median days-to-paid under 14 by end of Q2" combines "Forecast error at 30 days": does not hold (0.84) · [Remove this link]`

**E2 sol-satisfies, ledgerly e35** (capability Collections → problem "Matching bank deposits to invoices by hand at tax time")
`instructions: "Does the capability \"Collections\" remove or reduce the problem \"Matching bank deposits to invoices by hand at tax time\"?"`
Answer `noul .27` → conf .46, offer → **weak**. Retype (`keep | has | references | none`): `none .48, keep .31` → offer.
`● ● ○ Satisfies? · "Collections" satisfies "Matching bank deposits to invoices by hand at tax time": doubtful (0.46) · [Remove this link] [It is right]`

**E3 sol-evidence, ledgerly e18** (evidence → bet, typed refutes)
`instructions: "What does the evidence \"Only 1 in 5 trial users connected a bank feed\" say about the bet \"A 60-day forecast reduces end-of-month cash anxiety\"?"`
Answer `{"type":"choice","choice":"unrelated","confidence":0.58,"probabilities":{"unrelated":0.58,"refutes":0.37,"supports":0.05}}` → offer → **weak** `unrelated`.
`● ● ○ Evidence direction · "Only 1 in 5 trial users connected a bank feed" refutes "A 60-day forecast…": looks unrelated (0.58) · [Ask: Is it about the bet or about the assumption "Freelancers will connect a bank feed during onboarding"?]`

**E4 sol-monitors, ledgerly e11**
`instructions: "If the outcome \"Freelancers plan spending with confidence\" happened for real, would the metric \"Forecast error at 30 days\" show it?"`
Answer `noul .62` → conf .24, ask → **unknown** (accuracy is a proxy for confidence). Rendered as hollow dots, `unclear (0.24)`, repair `[Ask: How will you know "Freelancers plan spending with confidence" happened? Name one metric.]`.

**E5 cmp-need, ledgerly rule "Tax rate is frozen once an invoice is sent"** (rule needs `verifies` in; code: unmet)
```json
{"cmp-need|rule-tax-rate-is-frozen-once-an-invoice-is,verifies": {"type":"choice",
 "instructions":"The rule \"Tax rate is frozen once an invoice is sent\" needs a \"verifies\" link: How would we know \"Tax rate is frozen once an invoice is sent\" holds? One test per line, naming the condition.\nWhich of these test items is it? Pick none if none of them fits.",
 "criteria":{"test-concurrent-sends-keep-invoice-numbers":"Concurrent sends keep invoice numbers sequential","test-overpayment-is-rejected-with-a-refund":"Overpayment is rejected with a refund prompt","test-partial-payment-leaves-the-invoice-open":"Partial payment leaves the invoice open","none":"None of these; a new one is needed"}}}
```
Answer `none .91` → act → **broken** `missing`.
`● ○ ○ Need met? · "Tax rate is frozen once an invoice is sent" has no test, none of 3 fits (0.91) · [Ask: How would we know … holds?]`

**E6 cmp-flow-screen, ledgerly** (flow "Export the quarter for the accountant" uses no screen, so all 4 screens are asked)
`instructions: "Does someone following the flow \"Export the quarter for the accountant\" see or use the screen \"Invoice list\"?"` → `noul .74` → conf .48, offer → **weak** `implied?`. The other three answer ≤ .20 → **solid** (`not-implied`, hidden by default filter).
`● ● ○ Flow uses screen? · "Export the quarter for the accountant" probably happens on "Invoice list" (0.48) · [Link "Export the quarter…" uses "Invoice list"]`

**E7 con-test-case, ledgerly rule "Invoice numbers are sequential with no gaps"** (one test)
`instructions: "Which case of the rule \"Invoice numbers are sequential with no gaps\" does the test \"Concurrent sends keep invoice numbers sequential\" check?"` → `pos .81` → **weak** `pos-only`.
The sibling rule "A payment never exceeds the open balance" gets `neg .88` (Overpayment is rejected…) and `pos .79` (Partial payment leaves…) → **solid** `both`.
`● ● ○ Tested both ways? · "Invoice numbers are sequential with no gaps": positive case only (0.81) · [Ask: … has no negative test. What should be rejected to prove it?]`

**E8 con-bet-evidence, ledgerly "A 60-day forecast reduces end-of-month cash anxiety"** (no verdict field)
`instructions: "Taken together, what does this evidence say about the bet \"A 60-day forecast reduces end-of-month cash anxiety\"?\n  - \"Interviews: freelancers ignore forecasts beyond 30 days\"\n  - \"Only 1 in 5 trial users connected a bank feed\""`
Answer `{"type":"score","score":0,"confidence":0.74,...}` → act, rec `open` → **weak** `unrecorded`.
`● ● ○ Bet verdict · evidence says refuted (0.74), verdict not recorded · [Set verdict to refuted]`

**E9 con-rule-pair, bropilot thing "Commit"** (rules rule-commit-gate × rule-agent-through-gate)
`instructions: "Can both rules hold at the same time for the thing \"Commit\"?\n  Rule A: \"A node or edge becomes committed only through a Commit\"\n  Rule B: \"Agent changes go through the commit gate; only glossary takes the escape hatch\"\n    conditions: \"Agent changes go through the commit gate / Only glossary edits take the escape hatch\""`
Answer `noul .41` → conf .18 → **unknown**; on `escalate`, clef answers `.22` → conf .56, offer → **weak** `tension`.
`● ● ○ Rules agree? · "A node or edge becomes committed only through a Commit" vs "…only glossary takes the escape hatch" on "Commit": tension (0.56, clef) · [Ask: Which one wins, or how do they combine?]`

**E10 con-outcome-metric, bropilot e13**
`instructions: "The outcome \"Knows what good means and sees progress toward it\" states its success metric as \"hypotheses with verdicts\". Does the linked metric \"Share of hypotheses with a verdict\" measure that same thing?"` → `noul .93` → **solid** `same`.
`● ● ● Metric agrees · "Share of hypotheses with a verdict" = "hypotheses with verdicts" (0.86)`

## 3. Engine (`src/checks/`)

### 3.1 Files
| file | exports |
|---|---|
| `types.ts` | §6 verbatim |
| `phrasing.ts` | §2.1 helpers, `EX`, `STAGE_WORDS`, `conditionsOf`, `lastTwoPathSegments` |
| `catalog.ts` | `CHECKS: Record<CheckId, CheckDef>`, `routeEdge(e, ctx): CheckId \| null` |
| `plan.ts` | `planChecks`, `planRetype`, `makeCtx` |
| `batch.ts` | `batch`, `requestChars` |
| `resolve.ts` | `resolveCheck`, `nounVerdict`, `rollup` |
| `fake.ts` | `fakeNoul`, `fakeChoice`, `fakeAnswers(unit, ctx)` |
| `cache.ts` | `hashUnit`, `readCache`, `writeCache`, `evictSubjects`, `reviewed` |
| `cost.ts` | `PRICE_PER_MTOK`, `estimate` |
| `run.ts` | `runChecks` |
| `repairs.ts` | `repairToEffects(r, graph): Effect[]` (pure) |
| `useChecks.ts` | Pinia store implementing `ChecksApi` (§6) |
| `checks.test.mjs` | node tests: routing, batching limits, fake determinism, verdict table, cache keys |

### 3.2 Signatures
```ts
export function makeCtx(graph: Graph, onto: CheckOntology, project: string): PlanCtx;
export function planChecks(graph: Graph, onto: CheckOntology, scope?: CheckScope, project?: string): CheckUnit[];
//  scope.nodeIds: units whose subjects include any id, plus every edge touching those nodes; scope.edgeIds: units for those edges
//  scope.families / checkIds filter. No scope = everything. Units sorted by key. sol-retype is never planned here.
export function planRetype(results: CheckResult[], ctx: PlanCtx): CheckUnit[];
export function batch(units: CheckUnit[], model: 'clef-flash' | 'clef'): { request: DecideRequest; units: CheckUnit[] }[];
//  groups by checkId (homogeneous), in unit-key order; a unit is never split; a request closes when the next unit would make
//  questions > 64 or requestChars > 60_000 (JSON.stringify({state, questions}).length). request.fn = 'check'.
export async function runChecks(units: CheckUnit[], opts: { model: CheckModel; concurrency?: number /* 4 */;
  onProgress?: (p: CheckProgress) => void; signal?: AbortSignal; decide?: typeof decide /* s1/client.ts, timeout 8000 */;
  ctx: PlanCtx; useCache?: boolean /* true */ }): Promise<CheckResult[]>;
export function resolveCheck(unit: CheckUnit, answers: Record<string, S1Answer>, ctx: PlanCtx): Omit<CheckResult, 'at' | 'model' | 'fake' | 'hash'>;
export async function hashUnit(unit: CheckUnit, model: string): Promise<string>;
//  hex sha1 (crypto.subtle) of `${unit.checkId}\n${unit.subjects.join(',')}\n${JSON.stringify(unit.questions)}\n${model}\n${CHECKS_VERSION}`
export function estimate(units: CheckUnit[], model: CheckModel): CostEstimate;
```
Keys: `unit.key = `${checkId}|${subjects.join(',')}``; question key = `unit.key` for a single question, `${unit.key}|${slot}` otherwise.

### 3.3 runChecks, step by step
1. For each unit: `unit.code` set (code-resolved, e.g. cmp-need with no candidates) → result with `model: 'code'`, `fake: false`, conf 1.
2. Cache hit on `hashUnit(unit, wireModel)` → reuse (escalate looks up the clef hash first, then flash). `reviewed[unit.key] === hash` → `verdict 'solid'`, `finding 'reviewed'`.
3. `batch()` the rest on `clef-flash` (`clef` when model is `clef`); send with `concurrency`; `onProgress` after each response.
4. Response `fake: true` (Worker without AI binding, or client fallback) → discard its answers and use `fakeAnswers(unit, ctx)`; result `fake: true`, `model: 'fake'`.
5. `resolveCheck` each unit; a missing answer key → that unit only becomes fake.
6. `escalate`: units with `family === 'consistency'` or `band === 'offer'` are re-batched on `clef`; a non-fake clef result replaces the flash one.
7. `planRetype(weak|broken solidity results)` → one more `batch`/send; each retype result folds into its parent (`repairs` replaced, `answers` merged, `evidence` gets ` · fits better: {label} ({conf})` or ` · should not be linked ({conf})`).
8. Write cache (non-fake only), return results sorted broken, weak, unknown, solid, then confidence ascending.

### 3.4 Cache
localStorage `uip.checks.v1.<project>`: `{ [hash]: CheckResult }`, cap 3000, evict oldest `at`. Index `bySubject` rebuilt in memory on load.
`uip.checks.reviewed.<project>`: `{ [unitKey]: hash }`. A graph change needs no explicit invalidation (inputs change), but
`useChecks` drops in-memory results whose subjects include a removed node/edge (`evictSubjects`). Fake results are memory only.

### 3.5 Incremental (changesets)
`previewChangeset(cs)`: `g2 = graph + pending effects` (add/update as drafts, removals dropped); `touched = effect node ids ∪
added edge ids ∪ endpoints`; `runChecks(planChecks(g2, onto, { nodeIds: touched, edgeIds: touched }))`. Card line:
`clef: 3 solid · 1 weak · 0 broken` (`checking…` while pending). Accept is never blocked; broken > 0 makes the line red and
the Accept button's `title` lists the broken evidence.

### 3.6 Cost
```ts
export const PRICE_PER_MTOK = { 'clef-flash': 0.09, clef: 0.24 } as const;   // input only; output not billed (research, 2026-10-01)
estimate = Σ over batch(units) of ceil(requestChars / 4) × price / 1e6; escalate = flash(all) + clef(consistency units)
```
Shown as `≈ 312 questions · 7 requests · ≈ $0.006 on clef-flash`. Rough bropilot full run: about 300 questions at about 200
tokens each, about 60k tokens: about $0.005 flash, $0.015 clef (estimate from the formula, not measured).

## 4. UI (⚑ = varies by flag)

**Flags** (added to `FLAGS` in `src/flags.ts`, first value is the default):
| id | values | what each value uniquely changes |
|---|---|---|
| `checks` | lazy · eager · off | lazy: `ensure()` for what mounts (row pills, node pane), debounced 250 ms into one plan. eager: `runAll()` on project open, top-bar progress. off: no automatic calls; cached results still render, Audit "Run all" still works |
| `verdictStyle` | dots · words · hidden | dots: 3 dots (solid ●●●, weak ●●○ amber, broken ●○○ red, unknown ○○○). words: finding chip (`holds`, `doubtful`, `missing`). hidden: no pills in rows or chips; verdicts only in node pane band and Audit |
| `repairMode` | thread · inline | thread: a repair stages a Changeset by S1 (`Check repair: <label>`) in the thread for Accept. inline: the same changeset is accepted at once (effects land as drafts) with an undo toast |
| `checkModel` | flash · escalate · clef | flash: everything on clef-flash. escalate: flash, then consistency + offer-band units re-asked on clef. clef: everything on clef |
Default `repairMode` is `thread` because "Propose never acts" (SPEC §6). Dropped alternatives: `checks: per-family`
(families are an Audit filter, not a mode); `verdictStyle: heat` (row tint clashes with draft/suspect styling);
`repairMode: auto` (applying act-band repairs unasked breaks the commit gate); `checkModel: jev` (seam allows it, no key).

**Surfaces**
- `EdgePill.vue` (`{ edgeId }`) ⚑verdictStyle: right of the edge verb in `NodeRow.vue` (when `item.edge`) and on each chip in
  `EdgeGroup.vue`. Hover/focus opens a popover: evidence line, repair buttons (first is primary), `clef-flash · 0.84 · 2m ago`,
  `Re-check`. Pending: one pulsing dot. Unchecked under `lazy`: nothing until checked.
- `ChecksBand.vue` in `NodePane.vue`, below NeedsList: title `Checks`, three groups `Weak or broken links (n)`, `Missing (n)`,
  `Disagreements (n)`, each row = dots + evidence + primary repair + `…` menu. Empty: `All {n} checked links solid` + `Re-check`.
- `CheckBadge.vue` in `ColumnHeader.vue`: `⚠ n` = weak + broken results touching the column's items; click → `filter` command to those items; hidden at 0.
- `views/Audit.vue`, route `/p/:project/audit`: header `Audit 41/52 solid (79%) · 6 weak · 3 broken · 2 unknown`; buttons
  `Run all (≈ … )`, `Export JSON` (file `audit-<project>-<yyyymmdd>.json`: `{ project, at, model, results }`); progress
  `84/312 questions · 3/7 requests · $0.002`; tabs `All | Solidity | Completeness | Consistency`; verdict filter chips (default
  broken + weak + unknown); columns `Verdict | Check | Subjects (NodeChips) | Evidence | Confidence | Repairs | Model · age`;
  sort broken, weak, unknown, solid, then confidence ascending; row click → permalink to first node subject.
- `AuditScore.vue` (`{ project }`), read from cache only: `audit 79%` = solid / checked over solidity results; `audit —` when
  none. In `ProjectHome.vue` beside the perspective coverage block and in `ProjectRow.vue` (picker) after the counts. Links to Audit.
- Chat ⚑checks: intent `check`. `turn.ts` adds `check` to `INTENT_CRITERIA`: `'Check whether part of the map is right: is a link solid, what is missing, what is inconsistent'`, and always adds
  `check-family: { type: 'choice', instructions: 'If the message asks for a check, what kind of check?', criteria: { solidity: 'Whether existing links are right (is this solid, does X really satisfy Y)', completeness: 'What is missing (what is missing on X, what does X lack)', consistency: 'What disagrees (what is inconsistent, any contradictions, does X match Y)', all: 'Everything about the item, or not said' } }` (seed budget 50 → 51).
  `fake.ts`: `/\b(solid|check|audit|consistent|inconsistent|contradict\w*|missing|lacks?|sound|holds?)\b/i` → `check`, tested before the ask rule.
  Engine: target = resolved node, else selected node, else project. Reply `{ type: 'checks', head, resultIds, pending }` rendered by
  `CheckList.vue` (ResultList rows with dots): head `4 checks on "Collections": 2 solid, 1 weak, 1 broken` or
  `Worst 8 of 212 checks in Ledgerly`, ≤ 8 rows worst first, link `Open audit`.
- `ChangesetCard.vue`: second line under the code checks (§3.5); hidden when `checks: off` and nothing cached.

## 5. Thresholds and eval

Added to `src/s1/decisionConfig.ts` `S1_THRESHOLDS` (starting points from lfp equivalents; tune from the eval):
```ts
'sol-edge': 0.6, 'sol-satisfies': 0.6, 'sol-implements': 0.6, 'sol-verifies': 0.7, 'sol-evidence': 0.7, 'sol-monitors': 0.6,
'sol-realises': 0.6, 'sol-bet-metric': 0.55, 'sol-retype': 0.65,
'cmp-need': 0.65, 'cmp-problem-audience': 0.55, 'cmp-outcome-metric': 0.6, 'cmp-interface-carries': 0.55, 'cmp-flow-screen': 0.55, 'cmp-purpose-outcome': 0.6,
'con-rule-pair': 0.75, 'con-bet-evidence': 0.7, 'con-outcome-metric': 0.6, 'con-test-case': 0.7, 'con-feature-stages': 0.55,
'con-dup-title': 0.8, 'con-summary': 0.75, 'con-term-usage': 0.65,
```
**`scripts/gen-check-eval.mjs`** (deterministic, `mulberry32(20261004)`) writes `public/eval/checks-labelled.json` (30 rows):
- 10 `true`: seed edges routed to a sol-* check, round-robin over edge types, from bropilot, ledgerly, tidepool.
- 10 `retype`: other edges whose (src kind, dst kind) admits another SEMANTIC type except `references` and `has` (both too
  often still true); type replaced by the first such alternative by id. Expect not-solid, retype answer = original type.
- 10 `broken`: type kept, dst replaced by a node of the same kind not linked to src, lowest token overlap, rng tie-break.
  Expect not-solid, retype answer `none`.
Row: `{ id, project, label: 'true'|'retype'|'broken', edge: {src,dst,type}, original: {src,dst,type}, expect: { solid: boolean, retype?: string }, reviewed: false }`.
A human reads every row and sets `reviewed: true` (a corruption can land on a true pair); the eval uses reviewed rows only.

**`scripts/checks-eval.mjs`** (`npx tsx scripts/checks-eval.mjs --model flash|clef|escalate|fake [--url http://127.0.0.1:8787/api/decide]`):
injects each row's edge into its seed graph, `planChecks(..., { edgeIds: [row edge] })`, `runChecks` with an injected `decide`
that POSTs to `--url` (fake runs in-process), writes `public/eval/checks-report.json` and prints one row per model:
`model | n | flag precision | flag recall | strict recall (broken only) | solid precision | retype accuracy | mean conf | mean ms | $`.
Positive = not-solid; flagged = weak|broken; unknown counts as not flagged. Gate before trusting a threshold: flag precision
≥ .80 and recall ≥ .70 on flash, else raise the threshold or make that check escalate-only.

## 6. Build plan

**Shared contract, committed first by WP-A** (WP-B starts after it): `src/checks/types.ts` below; `src/types.ts`
`DecideRequest.fn` gains `'check'` and `Intent` gains `'check'`; `src/flags.ts` gains the four flags; `scripts/emit-ontology.mjs`
emits `hint` on EDGE_TYPES plus `RELATIONS` and `LIFECYCLE_STAGES`, and `src/s1/onto.ts` types them (`hint?`, optional arrays).
```ts
// src/checks/types.ts
import type { Ref } from 'vue';
import type { Band, Changeset, Edge, Graph, Node, S1Answer, S1Question } from '../types';
import type { Ontology, OntoEdgeType } from '../s1/onto';
export type Family = 'solidity' | 'completeness' | 'consistency';
export type CheckId =
  | 'sol-edge' | 'sol-satisfies' | 'sol-implements' | 'sol-verifies' | 'sol-evidence' | 'sol-monitors' | 'sol-realises' | 'sol-bet-metric' | 'sol-retype'
  | 'cmp-need' | 'cmp-problem-audience' | 'cmp-outcome-metric' | 'cmp-interface-carries' | 'cmp-flow-screen' | 'cmp-purpose-outcome'
  | 'con-rule-pair' | 'con-bet-evidence' | 'con-outcome-metric' | 'con-test-case' | 'con-feature-stages' | 'con-dup-title' | 'con-summary' | 'con-term-usage';
export type Verdict = 'solid' | 'weak' | 'broken' | 'unknown';
export type CheckModel = 'flash' | 'escalate' | 'clef';
export interface CheckOntology extends Ontology {
  EDGE_TYPES: (OntoEdgeType & { hint: string })[];
  RELATIONS: { src: string; edge: string; dst: string; many?: boolean; at: 'src' | 'dst' | 'both'; need?: string }[];
  LIFECYCLE_STAGES: string[];
}
export interface CheckScope { nodeIds?: string[]; edgeIds?: string[]; families?: Family[]; checkIds?: CheckId[] }
export interface CheckUnit {
  key: string;                                   // `${checkId}|${subjects.join(',')}`
  checkId: CheckId; family: Family;
  subjects: string[];                            // node ids; an edge is 'edge:<id>', then its src and dst ids
  questions: Record<string, S1Question>;         // keys: unit.key or `${unit.key}|${slot}`; empty when `code` is set
  meta: Record<string, string | string[]>;       // ids the resolver needs (edgeId, slots, candidate ids, linked flag)
  code?: { verdict: Verdict; finding: string; evidence: string; repairs: Repair[] };
}
export type Repair = { label: string; primary?: boolean } & (
  | { op: 'remove-edge'; edgeId: string }
  | { op: 'retype-edge'; edgeId: string; to: string }
  | { op: 'add-edge'; src: string; dst: string; type: string }
  | { op: 'add-node'; node: { kind: string; title: string; props?: Record<string, string> }; link?: { type: string; dir: 'out' | 'in'; other: string } }
  | { op: 'update-node'; nodeId: string; props: Record<string, string> }
  | { op: 'merge-nodes'; keep: string; drop: string }
  | { op: 'question'; text: string; nodeIds: string[]; kind: string | null }
  | { op: 'mark-reviewed' });
export interface CheckResult {
  id: string;                                    // = unit.key
  checkId: CheckId; family: Family; subjects: string[];
  verdict: Verdict; finding: string; confidence: number; band: Band;
  answers: Record<string, S1Answer>; evidence: string; repairs: Repair[];
  at: string; model: string; fake: boolean; hash: string;
}
export interface PlanCtx { graph: Graph; onto: CheckOntology; project: string; byId: Map<string, Node>;
  out: Map<string, Edge[]>; in: Map<string, Edge[]> }
export interface CheckDef { id: CheckId; family: Family; label: string; findings: readonly string[];
  plan(ctx: PlanCtx, scope: CheckScope): CheckUnit[];
  resolve(unit: CheckUnit, answers: Record<string, S1Answer>, ctx: PlanCtx): Omit<CheckResult, 'at' | 'model' | 'fake' | 'hash'>;
  fake(unit: CheckUnit, ctx: PlanCtx): Record<string, S1Answer> }
export interface CheckProgress { done: number; total: number; questions: number; requests: number; usd: number }
export interface CostEstimate { questions: number; requests: number; tokens: number; usd: number; model: CheckModel }
export interface ChecksApi {
  results: Ref<Record<string, CheckResult>>; pending: Ref<Set<string>>; progress: Ref<CheckProgress | null>;
  forEdge(edgeId: string): CheckResult | undefined;       // its solidity result, retype folded in
  forNode(nodeId: string): CheckResult[];
  score(): { solid: number; weak: number; broken: number; unknown: number; checked: number; edges: number };
  ensure(scope: CheckScope): Promise<void>;               // debounced 250 ms; runs only uncached units
  runAll(): Promise<void>; cancel(): void;
  estimate(scope?: CheckScope): CostEstimate;
  previewChangeset(cs: Changeset): Promise<{ solid: number; weak: number; broken: number; unknown: number; results: CheckResult[] }>;
  markReviewed(resultId: string): void;
  exportJson(): string;
}
```
Card labels per check (`CheckDef.label`): sol-edge `Link holds?`, sol-satisfies `Satisfies?`, sol-implements `Implements?`,
sol-verifies `Test checks rule?`, sol-evidence `Evidence direction`, sol-monitors `Metric shows outcome?`, sol-realises
`Realised here?`, sol-bet-metric `Metric shows bet?`, sol-retype `Better relation`, cmp-need `Need met?`, cmp-problem-audience
`Whose problem?`, cmp-outcome-metric `Outcome measured?`, cmp-interface-carries `Payload carries?`, cmp-flow-screen
`Flow uses screen?`, cmp-purpose-outcome `On purpose?`, con-rule-pair `Rules agree?`, con-bet-evidence `Bet verdict`,
con-outcome-metric `Metric agrees`, con-test-case `Tested both ways?`, con-feature-stages `Stages covered?`, con-dup-title
`Duplicate?`, con-summary `Summary agrees?`, con-term-usage `Term used as defined?`.

**WP-A: engine and eval.** New: everything in §3.1, `scripts/gen-check-eval.mjs`, `scripts/checks-eval.mjs`,
`public/eval/checks-labelled.json`, `public/eval/checks-report.json`. Edits: `src/types.ts` (two union members),
`src/flags.ts` (four entries), `scripts/emit-ontology.mjs` + regenerated `src/data/ontology.json`, `src/s1/onto.ts` (optional
fields), `src/s1/decisionConfig.ts` (thresholds block), `package.json` scripts `checks:test`, `checks:gen-eval`, `checks:eval`.
`useChecks.ts` watches `useGraph().project` for `checks: eager` and reads `flags.checkModel`. The Worker needs no change
(`fn` is not validated); confirm `/api/decide` passes `model: 'clef'` through.

**WP-B: UI, chat intent, flags UI.** New: `src/components/checks/{VerdictDots,EdgePill,ChecksBand,CheckBadge,AuditScore,CheckList}.vue`,
`src/views/Audit.vue`, `src/checks/applyRepair.ts` (`applyRepair(r, result)`: `question` → QuestionStub in chat; `mark-reviewed`
→ `useChecks().markReviewed`; else `repairToEffects` → Changeset by S1 per `repairMode`). Small named edits:
- `router.ts`: add `{ path: '/p/:project/audit', name: 'audit', component: () => import('./views/Audit.vue') }` **before** the traversal route (else `audit` parses as a perspective).
- `NodeRow.vue`: `<EdgePill v-if="item.edge" :edge-id="item.edge.id" />` after the verb.
- `EdgeGroup.vue`: same pill inside each chip.
- `NodePane.vue`: `<ChecksBand :node="node" />` below NeedsList; `ensure({ nodeIds: [node.id] })` on mount when `checks: lazy`.
- `ColumnHeader.vue`: `<CheckBadge :col="col" />`.
- `ChangesetCard.vue`: the §3.5 line.
- `ProjectHome.vue`, `picker/ProjectRow.vue`: `<AuditScore :project="id" />`; ProjectHome also links `Audit`.
- `s1/turn.ts`: intent option + `check-family` question; `s1/resolve.ts`: `check` resolves a target like `explain` but never forces `ask` when none (project scope); `s1/fake.ts`: check regex first.
- `chat/engine.ts`: `ReplyPayload` member `{ type: 'checks'; head: string; resultIds: string[]; pending: boolean }`; `chat/ReplyEntry.vue` renders `CheckList`.
- `FlagsPopover.vue`: only if it does not already render every `FLAGS` entry.

**Integration checklist**
1. `npm run checks:test` green: routing sends every seed SEMANTIC edge to exactly one check; no request over 64 questions or 60k chars; same graph → same keys and hashes; fake answers identical across runs.
2. `checks: off` + empty cache: no `/api/decide` call with `fn: 'check'` after a full traversal (count via `s1Stats.requests`).
3. `checks: lazy`: opening a column with 6 edges sends one request; reopening sends none (cache).
4. ledgerly Audit `Run all` on fake: finishes with `fake` tags, zero broken from fakes except code results (cmp-need E5).
5. A repair under `thread` creates an open S1 changeset; under `inline` it lands accepted with an undo toast; undo restores.
6. Editing a node title re-checks only units naming it (cache miss), visible as pending dots on its edges.
7. ChangesetCard of a proposal shows the clef line before Accept.
8. Chat `is this solid?` with an edge's node selected returns a CheckList; `what's missing on Collections?` runs completeness only.
9. `npm run checks:eval -- --model flash` writes the report; thresholds updated from it, numbers recorded in README Latest Update.
