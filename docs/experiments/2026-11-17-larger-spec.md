# E1: scale experiment (3x spec)

Run 2026-11-17. Spec `scale/clean3x` (854 graph nodes, 1508 links; whole-spec prompts ~130k input tokens vs ~43k at 1x). Subset fixed before any call (`subset.txt`): first 5 Arm-B-1x hits by id per category + c01-c03. Variants built by `patch -p1` of `diffs/<id>.diff` onto clean3x (`scripts/build3x.sh`): all 18 applied with no fuzz/offset, and `diff -ruN clean3x variants3x/<id>` equals `diff -ruN clean variants/<id>` line for line (headers excluded). All 18 load in `lint:system` (rc=1 on d02/d03 from consistency violations, same as 1x).

Arms (one independent `claude -p --model opus`, tools disabled, fresh empty dir per call, same flags as results/scripts/call.sh): **B3** = exact Arm B prompt (no diff) over the whole 3x variant; **W3** = diff + whole 3x spec; **S3** = diff + graph slice of the 3x graphs. W3/S3 prompts are built exactly as runner2's `mkprompts2.py` (same instruction and context sentence, anonymised diff headers). Slices: runner2's `results2/scripts/slices.ts` copied with only paths/id list changed (`scripts/slices3x.ts`). Rubric written before scoring: `rubric.txt`.

## Per-variant table

| id | cat | B 1x (rank) | B3 (rank) | W3 | S3 | W 1x | S 1x | slice 1x nodes/tok | slice 3x nodes/tok |
|---|---|---|---|---|---|---|---|---|---|
| d01 | cross-reference | hit (1) | hit (4) | hit | hit | hit | hit | 61/11372 | 62/11682 |
| d02 | cross-reference | hit (1) | hit (1) | hit | hit | hit | hit | 138/21878 | 176/28920 |
| d03 | cross-reference | hit (13) | hit (14) | hit | hit | hit | hit | 59/11067 | 59/11067 |
| d04 | cross-reference | hit (11) | miss | hit | hit | hit | hit | 77/13907 | 108/19445 |
| d05 | cross-reference | hit (10) | hit (5) | hit | hit | hit | hit | 84/15574 | 92/17333 |
| d11 | semantic | hit (1) | hit (1) | hit | hit | hit | hit | 62/11725 | 63/12057 |
| d12 | semantic | hit (1) | hit (1) | hit | hit | hit | hit | 16/2239 | 18/2449 |
| d13 | semantic | hit (1) | hit (1) | hit | hit | hit | hit | 20/2389 | 20/2389 |
| d14 | semantic | hit (1) | hit (1) | hit | hit | hit | hit | 8/1036 | 8/1036 |
| d15 | semantic | hit (1) | hit (5) | hit | hit | hit | hit | 23/4546 | 24/4877 |
| d22 | local | hit (14) | miss | hit | hit | hit | hit | 5/909 | 5/909 |
| d23 | local | hit (4) | hit (4) | hit | hit | hit | hit | 1/121 | 1/121 |
| d24 | local | hit (15) | hit (4) | hit | hit | hit | hit | 67/12310 | 68/12642 |
| d25 | local | hit (14) | miss | hit | hit | hit | hit | 6/962 | 6/962 |
| d26 | local | hit (6) | hit (15) | hit | hit | hit | hit | 46/9076 | 54/10835 |
| c01 | control | clean | clean | clean | clean | clean | clean | 44/7580 | 89/15348 |
| c02 | control | clean | clean | clean | clean | clean | clean | 5/116 | 5/116 |
| c03 | control | clean | clean | clean | clean | clean | clean | 36/7515 | 36/7515 |

W 1x / S 1x = runner2's E2 outcomes on the same variants (results2/e2.json), for reference.

## Totals

| arm | all | cross-ref | semantic | local | control false alarms |
|---|---|---|---|---|---|
| Arm B at 1x (by construction) | 15/15 | 5/5 | 5/5 | 5/5 | 0/3 |
| B3 | 12/15 | 4/5 | 5/5 | 3/5 | 0/3 |
| W3 | 15/15 | 5/5 | 5/5 | 5/5 | 0/3 |
| S3 | 15/15 | 5/5 | 5/5 | 5/5 | 0/3 |

B3 rank movement on the 15 (1x -> 3x): d01 1->4, d02 1->1, d03 13->14, d04 11->miss, d05 10->5, d11-d14 1->1, d15 1->5, d22 14->miss, d23 4->4, d24 15->4, d25 14->miss, d26 6->15. The three misses are exactly three of the four 1x hits that sat at ranks 11-15 (d04 11, d22 14, d25 14); d03 (13) survived at 14, d24 (15) moved up to 4. Rank-1 hits at 1x: 7 of 8 stayed in the top 5 (d01 to 4, d15 to 5).

## Cost, tokens, latency per call (means over 18 calls each)

| arm | input tokens | output tokens (thinking) | cost USD | latency s | arm total USD |
|---|---|---|---|---|---|
| B3 | 129802 | 7711 (5997) | 1.188 | 70.8 | 21.38 |
| W3 | 130154 | 194 (19) | 1.040 | 3.4 | 18.72 |
| S3 | 16203 | 188 (27) | 0.128 | 2.7 | 2.31 |

Plus B3 on clean3x: 129812 in / 7370 out, $1.181, 67s. **Total spend: $43.59 over 55 calls.** At 1x Arm B averaged ~42.7k in / 5.8k out, ~$0.45/call. Input is billed as 1h cache creation (no cache reuse across calls), so W3 costs ~$1.04 even though it emits ~190 tokens. W3/S3 used almost no thinking (mean 19/27 thinking tokens); B3 used ~6k.

Context: no call overflowed. Largest prompt that worked: 130,465 input tokens (a W3 call); every B3/W3 prompt was 129.4k-130.5k tokens.

## Slice size 1x vs 3x

Changed-node sets C are identical at 1x and 3x for all 18. Mean slice 42.1 -> 49.7 nodes, 7,462 -> 8,872 tokens (+19% in total tokens, while the spec grew ~3x). 10/18 slices grew, 8 were identical. Largest growth: c01 44 -> 89 nodes (7.6k -> 15.3k tok; screen.signin's 2-hop neighbourhood now reaches shared nodes used by the new Things), d04 77 -> 108, d02 138 -> 176, d26 46 -> 54. c02 still falls back to diff-text ids (empty graph delta, 5 nodes).

## B3 on clean3x: where the 15 items point

1. `C.system.structure`: The criterion requires exactly one app Thing (thing.webapp), but system.yaml declares three Things (thing.webapp, thing.pilot, thing.support), so structure validation must fail or the criterion is wrong.
2. `evolution.2`: Evolution 2 delivers Today prompts and C.webapp.prompts.bounded, but entity.Suggestion only arrives in evolution.4; evolution.pilot.1/2 (measure.compute reads Suggestion snooze state) also depend only on evolution.2.
3. `auth`: The required authentication Kit is not pinned, so C.system.readiness and S.webapp.authentication cannot be satisfied and the core is not ready to realize.
4. `operation.pilot.consent.narrow`: Turning off quoting withdraws only quote excerpts 'not yet in an approved release', but DataRelease may never contain quote excerpts, so the exception is contradictory and could leave quotes in research use after narrowing.
5. `entity.Connection`: The invariant 'At most one active pair' contradicts 'a user may have many independent pairs'; it should be scoped to one active pair per account pair.
6. `operation.data.delete`: Deletion promises to purge all owned live data, but it writes only Account, ContactRecord and NotificationJob, omitting RelationshipGoal, ContactEvent, Suggestion, ConnectionInvite, Connection and Block.
7. `p3`: The journey offers pause goal and revise goal directly from a Today card, but SuggestionCard only has Open person, Log contact and Snooze controls.
8. `s2`: The journey edits an existing contact through AddContactDialog by opening a row, but ContactRow Open navigates to /people/:id and no screen offers an edit-contact affordance.
9. `component.PrivateNotes`: Owner-only notes are a core promise, yet no entity has a notes field (ContactRecord lacks one) and PrivateNotes reads entity.ContactEvent instead.
10. `affordance.ConnectionPanel.block`: Block requires a ContactRecord linked to an Account, but no operation (including invite.accept) ever sets linkedAccountId, and no unblock operation exists although blocks last 'until removed'.
11. `operation.pilot.measure.compute`: The pilot Thing reads webapp entities (RelationshipGoal, ContactEvent, Suggestion) and operation.pilot.sweep reads entity.Account, but the pilot has only pilotStore and no declared binding or cross-Thing contract for those reads.
12. `evolution.pilot.3`: Several pilot nodes appear in no evolution, including screen.pilot.interview, operation.pilot.cohort.save, release.draft, release.revoke, interview.publish, quote.review, burden.report, effort.rate, reflection.save, participant.export and sweep, even though acceptance criteria depend on them.
13. `entity.DataRelease`: The release state includes 'published' and revoke applies to published releases, but no operation or journey step ever transitions a release to published.
14. `entity.BurdenReport`: Burden reports are accepted in any phase for non-withdrawn enrollments (including completed), but BurdenReport.phase only allows baseline|pilot.
15. `evolution.5`: The genomeDelta summary (rule out group discussion explicitly, add a missed-goal clause) does not implement the stated intent of making reader-driven digests unambiguously non-group, and the evolution has no dependsOn despite needing the core.

Classification (mine): 1 item is the known scale side effect (#1 C.system.structure, 'exactly one app Thing'); 9 concern the original web app/core (#2, 3, 5, 6, 7, 8, 9, 10, 15; #2 also mentions pilot dependence); 5 concern the new Things (#4, 11, 12, 13, 14). Across the 18 variant B3 runs, C.system.structure took rank 1-2 in 17 of 18 (rank 9 in d13) and a keyword count puts 4-8 items per run on the new Things. So ~6-9 of 15 slots go to new material, which is the mechanism that pushed the 1x rank 11-14 hits out.

## Borderline calls

- **d03 B3 = hit (rank 14)**: 'no policy.ownerOnly or policy.authentication governance and is absent from S.webapp.operations, journeys and evolutions'. Same element, same nature as manifest; does not mention the suggestion-suppression claim (same as at 1x).
- **d26 B3 = hit (rank 15)**: last slot, precise ('occurredAt has the misspelled type timestmap').
- **d01 B3 = hit (rank 4)**: node `b2`, 'ConnectionPanel defines only Invite and Disconnect affordances, so no Block affordance exists' = the manifest's distant counterpart.
- **d04 B3 = miss**: no item about NotificationJob storage or binding.contactsStore; the only NotificationJob mentions are evolution ordering and data.delete (pre-existing).
- **d22 / d25 B3 = miss**: no item mentions UnavailablePanel / ConsentPanel.decline at all. (At 1x d25 was itself a trailing clause in a rank-14 item.)
- **d14 S3 = hit**: single item says the end state now exposes goals, 'replacing the guarantee that private goals and notes stay unshared, which contradicts the privacy model'. Does not name entity.RelationshipGoal or P1, but same element (J.connect e1) and same nature.
- **d03 W3/S3 = hit**: both name missing ownerOnly/authentication governance and the unwritten Suggestion effect. S3's first item (unwritten Suggestion) is itself in the manifest's why, so counting it from item 1 or 3 does not change the outcome.
- **d12 S3 third item** (auto-logging duplicates the Log action) is extra noise; outcome is a hit on item 1.
- **Controls B3**: c02 lists the unpinned auth Kit (#13, pre-existing, also in clean3x) and nothing about pin order; c03 lists 'Block until removed, no unblock' (#8, pre-existing, also in clean3x) and nothing about the direction sentence; c01 has no item about screen.signin. No false alarms.
- C.system.structure items are treated as pre-existing (per brief): never a hit or false alarm.

## What went wrong / caveats

- First S3 batch failed before reaching the model: call3.sh was given relative prompt paths and cd's into an empty dir (`No such file`). No tokens spent; log kept as `calls_failed_relpath.log` (it also holds the clean3x probe line). Rerun with absolute paths; every model call then succeeded on its first attempt.
- One sample per arm per variant; no reruns. At 1x, the stability rerun moved d27 from 13 to 6, so ranks in the 10-15 band are noisy and the three B3 misses could partly be sampling variance rather than scale alone. B3's 12/15 should be read as 'low-rank hits are fragile', not a precise rate.
- Subset selection is conditioned on 1x Arm B hits, so B3 can only lose ground (regression to the mean is part of what is measured). W3/S3 were also 15/15 at 1x (runner2), so no arm can show improvement here.
- Single unblinded scorer (this agent); all 15 W3/S3 defect calls were clear hits, so the W3/S3 numbers do not depend on borderline judgment. B3 judgments with ranks are in `scripts/score3.py`.
- W3/S3 being 15/15 with 0/3 false alarms says the diff is doing most of the work; 3 controls is too few to estimate a false-alarm rate.

Files: `subset.txt`, `rubric.txt`, `e1.json`, `parsed.json`, `raw/<id>.<arm>.json` (CLI JSON), `prompts/`, `slices/` (+ meta.json), `lint_*.json`, `calls.log`, `scripts/` (build3x.sh, slices3x.ts, mkprompts3.py, mkprompt.py, call3.sh, parse3.py, score3.py).
