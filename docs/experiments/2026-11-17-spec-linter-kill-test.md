# Kill test: graph linter (Arm A) vs one-prompt LLM review (Arm B)

Run 2026-11-17. Arm A: `npm run -s lint:system -- <dir> --templates …/artyfact-cf/packages/templates --json` in packages/ontology-engine; appeared/resolved keyed on (rule, subject) vs clean. Arm B: `claude -p --model opus --tools "" --strict-mcp-config --no-session-persistence --setting-sources "" --output-format json`, prompt on stdin, each call from a fresh empty temp dir (probe confirmed: no tools, no CLAUDE.md/memory loaded). Prompt = the given instruction followed by all 27 files sorted by path, each with a `=== path ===` header (`armB/prompts/`). No call failed; no retries were needed.

Q = manifest flags it as possibly not a true defect (d16, d23, d28, d30).

## Per-variant table
| id | cat | subt | ? | Arm A | A source / finding | Arm B | B rank |
|---|---|---|---|---|---|---|---|
| d01 | cross-reference | 2 |  | miss |  (only resolved: flow.effectUnsurfaced) | hit | 1 |
| d02 | cross-reference | 1 |  | hit | existing ref.dangling S.webapp.due; ref.dangling S.webapp.prompts; ref.dangling affordance.SuggestionCard.snooze; ref.d | hit | 1 |
| d03 | cross-reference | 2 |  | hit | existing authz.ungoverned operation.contact.archive; journey.operationUncovered operation.contact.archive | hit | 13 |
| d04 | cross-reference | 2 |  | hit | flow flow.unstored entity.NotificationJob | hit | 11 |
| d05 | cross-reference | 2 |  | miss |   | hit | 10 |
| d06 | cross-reference | 2 |  | miss |   | hit | 1 |
| d07 | cross-reference | 1 |  | hit | existing criterion.subjectMissing C.webapp.prompts.bounded; ref.dangling C.webapp.prompts.bounded | hit | 1 |
| d08 | cross-reference | 1 |  | miss |   | hit | 1 |
| d09 | cross-reference | 2 |  | miss |   | hit | 1 |
| d10 | cross-reference | 2 |  | hit | flow flow.stepWithoutControl J.contacts/s4 | hit | 1 |
| d11 | semantic | 2 |  | miss |   | hit | 1 |
| d12 | semantic | 1 |  | miss |   | hit | 1 |
| d13 | semantic | 2 |  | miss |   | hit | 1 |
| d14 | semantic | 2 |  | miss |   | hit | 1 |
| d15 | semantic | 3 |  | miss |   | hit | 1 |
| d16 | semantic | 2 | Q | miss |   | hit | 1 |
| d17 | semantic | 2 |  | miss |   | hit | 1 |
| d18 | semantic | 2 |  | miss |   | hit | 1 |
| d19 | semantic | 2 |  | miss |   | hit | 1 |
| d20 | semantic | 3 |  | miss |   | hit | 1 |
| d21 | local | 1 |  | hit | existing affordance.incomplete affordance.ExportControls.export | miss |  |
| d22 | local | 1 |  | miss |  (only resolved: semantic:check:component.emptyState, semantic:check:component.loadingState) | hit | 14 |
| d23 | local | 3 | Q | miss |   | hit | 4 |
| d24 | local | 1 |  | miss |   | hit | 15 |
| d25 | local | 2 |  | hit | existing affordance.incomplete affordance.ConsentPanel.decline | hit | 14 |
| d26 | local | 2 |  | miss |   | hit | 6 |
| d27 | local | 2 |  | miss |   | hit | 13 |
| d28 | local | 2 | Q | miss |   | hit | 10 |
| d29 | local | 2 |  | miss |   | hit | 1 |
| d30 | local | 2 | Q | miss |   | hit | 12 |
| c01 | control | 1 |  | clean |   | clean |  |
| c02 | control | 1 |  | clean |   | clean |  |
| c03 | control | 1 |  | clean |   | clean |  |
| c04 | control | 1 |  | clean |   | clean |  |
| c05 | control | 1 |  | clean |   | clean |  |

## Totals (hits/N)

| slice | Arm A | Arm B | Arm A excl. Q | Arm B excl. Q |
|---|---|---|---|---|
| all defects | 7/30 | 29/30 | 7/26 | 25/26 |
| cross-reference | 5/10 | 10/10 | 5/10 | 10/10 |
| semantic | 0/10 | 10/10 | 0/9 | 9/9 |
| local | 2/10 | 9/10 | 2/7 | 6/7 |
| subtlety 1 | 3/7 | 6/7 | 3/7 | 6/7 |
| subtlety 2 | 4/20 | 20/20 | 4/17 | 17/17 |
| subtlety 3 | 0/3 | 3/3 | 0/2 | 2/2 |

Arm A hit source: new `flow.*` rules 2 (d04 `flow.unstored`, d10 `flow.stepWithoutControl`); pre-existing rules 5 (d02 ref.dangling from metamodel + artyfact.metamodel; d03 authz.ungoverned + journey.operationUncovered; d07 criterion.subjectMissing + ref.dangling; d21 and d25 affordance.incomplete). Loader rejections: 0 (every variant parsed; rc=1 on d02/d03/d07 only reflects consistency violations).

Arm B ranks of hits: 18 at rank 1, then 4, 6, 10, 10, 11, 12, 13, 13, 14, 14, 15. Seven hits sit at ranks 11-15 (d04 11, d30 12, d03 13, d27 13, d22 14, d25 14, d24 15), inside the 15-item cap; with a cap of 10 Arm B would score 22/30.

## False alarms on controls
- Arm A: 0/5 (no appeared or resolved findings on c01-c05).
- Arm B: 0/5. No item in any control run mentions the edited element's change. c03: run lists entity.Block (rank 2, "no unblock operation / no id or state"), which also appears in clean and is not about the direction sentence; not counted. c05: no item about J.control.export e2.

## Overlap (30 defects)

| | Arm B hit | Arm B miss |
|---|---|---|
| Arm A hit | 6 (d02 d03 d04 d07 d10 d25) | 1 (d21) |
| Arm A miss | 23 | 0 |

## Non-defect noise
**Arm A** on clean: 37 findings, identical in every variant except where listed: 6 node.provisional (designed provisional nodes), 14 hook.unbound (hooks with no implementation), 1 kit.unpinned auth (designed, per kits.yaml comment), 2 flow.effectUnsurfaced (Block/Disconnect change entity.Block/Connection that no screen shows: debatable), 14 checks@1 info semantic:check (empty/loading state, signifiers: heuristic, debatable). Zero noise was *introduced* by any variant; the only collateral changes were resolutions (d01 lost flow.effectUnsurfaced on the removed affordance; d22's 'TBD' description *resolved* two UnavailablePanel empty/loading-state checks, a perverse signal).

**Arm B**: always returned exactly 15 items (the cap) on all 42 calls, so every defect run carries 14 non-seeded items (13 where a second item also touched the defect, e.g. d11, d18). The non-seeded items are drawn from a stable pool of ~20 pre-existing issues that recur across runs (autonomy coverage `satisfies` gap, evolution ordering of Suggestion/NotificationJob, PrivateNotes storage, linkedAccountId never set, no unblock, data.delete writes, J.prompts p3 pause/revise, auth kit unpinned vs evolution.1 actionable, hook triggers vs gates, S.webapp.screens missing from journey requirements, invitation screen actor).

Clean-run items (my read, checked against the spec):
1. hook.system.autonomy requires consent+revocation coverage but only private.owner/prompts.bounded declare `satisfies: [C.system.autonomy]`: **real** (criteria.yaml:135, things/webapp/criteria.yaml:12,58).
2. evolution.2 ships Today prompts/C.webapp.prompts.bounded but entity.Suggestion/NotificationJob only enter in evolution.4: **real**.
3. PrivateNotes reads ContactEvent; ContactRecord has no notes field: **real**.
4. Nothing sets ContactRecord.linkedAccountId, so Block/Disconnect preconditions are unreachable: **real** (only declared, never written).
5. Block "until removed" but no removal operation/affordance/journey: **real**.
6. RelationshipGoal has no enabled field although GoalEnabledToggle and S.webapp.qualification use one: **real**.
7. J.prompts p3 offers pause/revise goal but SuggestionCard has only Open/Log/Snooze: **real**.
8. J.prompts p4 always ends at "qualifying contact resolves the suggestion": **debatable** (happy-path journey).
9. operation.data.delete writes only Account/ContactRecord/NotificationJob despite purging all owned data: **real**.
10. Header says PrimaryNav is not redeclared, yet component.PrimaryNav is declared (binding.d1 not listed in header): **real** for PrimaryNav, partly wrong for binding.d1.
11. System criteria gate promotion but hooks trigger only on submission: **debatable** (depends on gate/trigger semantics; factually accurate).
12. system.yaml lacks Externals/Theory/ontology references required by C.system.structure: **debatable** (template may supply).
13. evolution.5 genomeDelta adds "missed goal never punished" beyond its intent: **debatable**.
14. evolution.1 is state actionable while required auth Kit is unpinned: **real** tension (kits.yaml says the unpinned kit is a designed readiness finding; Arm A reports the same as kit.unpinned).
15. J.contacts s2 says opening a row edits it in AddContactDialog but ContactRow.open navigates to /people/:id: **real**.
None judged wrong; ~10 real, ~4-5 debatable. Arm A on clean surfaces only #14 of these (as kit.unpinned).

## Stability (Arm B rerun, set pre-registered before seeing run-1 results: d01 d06 d11 d18 d23 d27)
All 6 outcomes unchanged (hit/hit). Ranks run1 -> run2: d01 1->2, d06 1->1, d11 1->1, d18 1->1, d23 4->1, d27 13->6. Arm A is deterministic (not rerun).

## Time and cost
- Arm A: 36 runs in ~11 s total wall clock (~0.3-0.4 s each), no tokens.
- Arm B: 36 calls in 477 s wall clock at 4-way parallelism (40-70 s per call); ~42.7k input tokens + ~5.8k output tokens per call (incl. thinking); reported cost ~$0.45/call, $18.94 for all 42 calls (incl. 6 reruns).

## Borderline scoring calls
- **d25 Arm B = hit (rank 14)**: the decline defect appears as a trailing clause inside an item about the invitation screen's actor ("…affordance.ConsentPanel.decline lacks actor, trigger and any operation"). Same element, same nature; counted. ("any operation" was already true in clean.)
- **d03 Arm B = hit (rank 13)**: names missing governance, missing S.webapp.operations subject and no affordance/journey; does not mention the unsatisfied suggestion-suppression claim. Counted.
- **d10 Arm A = hit**: finding subject is J.contacts/s4 (a manifest node), describing the consequence (step's operation has no invoking control on its screen) rather than the mis-wired link itself.
- **d02 Arm A**: 17 appeared findings are duplicates across two packs for 9 referrers; one hit.
- **d01 Arm A = miss**: the only change is a *resolved* finding (flow.effectUnsurfaced on the deleted affordance). Disappearance is not detection; nothing flagged J.control.block b2 or the screen promise.
- **d22 Arm A = miss**: only resolutions (the TBD text made two semantic checks pass).
- **d21 Arm B = miss**: no item mentions ExportControls.export or its empty effects; the only "export" hit is the generic S.webapp.screens item.
- **d28 Arm B = hit (rank 10)**: flagged g5's unconditioned edge ("presumably cancel"). Manifest questions whether it is a defect.
- **d16/d30 Arm B = hit**: matches the manifest's description; both flagged questionable by manifest, reported excluded in the Q columns.
- **d24 Arm B = hit at rank 15** (last slot); d04 item 11 / d05 item 10 / d27 item 13 are precise and unambiguous.
- Controls: no borderline items found.

## What went wrong / caveats
- My monitor-based wait stalled after run 1 completed; outputs were unaffected (all 36 run-1 calls succeeded first try; logs in armB/run1.log, run2.log).
- Scoring of Arm B was done by me against the manifest after keyword pre-filtering (`scripts/cand.py`), then reading the full lists for the misses (d21) and controls. Single scorer, not blinded.
- Arm B is one sample per variant except the 6 reruns; the 15-item cap was saturated every time, so low-rank hits depend on the cap.

Files: `armA/*.json` (raw linter), `armA_diffs.json`, `armB/prompts/`, `armB/raw/run1|run2/*.json` (+ `.items.json`), `armB/run1_items.txt`, `results.json`, `scripts/`.
