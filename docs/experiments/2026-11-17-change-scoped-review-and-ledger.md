# E2 (change-scoped review) and E3 (finding ledger)

Run 2026-11-17. All calls: `claude -p --model opus --tools "" --strict-mcp-config --no-session-persistence --setting-sources "" --output-format json`, prompt on stdin, fresh empty temp dir per call (`scripts/call2.sh`, same flags as the previous experiment's `call.sh`). Slice rule pre-registered in `slice_preregistration.txt` and rubric in `rubric.txt`, both written before any model output. Single scorer (me), not blinded.

## E2 setup
- 35 variants x 3 arms = 105 calls, identical instruction, context differs (`scripts/mkprompts2.py`, prompts in `prompts/`). Diff headers were anonymised (`variants/dNN/` -> `b/`, `clean/` -> `a/`, timestamps stripped) because the directory name would have told the model defect vs control.
- S slice (`scripts/slices.ts`, outputs in `slices/`, `slices/meta.json`): changed nodes = graph-delta added/removed/changed nodes plus both endpoints of every added/removed/changed link (interpretation fixed in the pre-registration: d04 is a link-only change); + ancestors + direct children + 2-hop links either direction, not expanding through system/thing/section/template/kit; rendered from the variant graph with removed nodes/links from clean marked `removed`. Fallback (empty delta) used once: c02 (kit order swap; ids in the hunk).
- Slice size (graph = 302 nodes, 467 links): nodes min 1 / median 29 / mean 38.9 / max 138; tokens (chars/4) min 116 / median 5.9k / mean 6.9k / max 21.9k (d02, the rename: 138 nodes = 46% of the graph). The whole spec is ~40k tokens. d23's slice is a single node: hooks have no parent and reference criteria through a field, not a link.

## E2 per variant
Outcome: hit / MISS / hit? (borderline) / ok / FA. (g) grounded = the item asserts the conflict against a specific counterpart outside the diff text; (ung) = right element and nature but hedged ("likely", "any part of the spec") or argued only from the diff's removed text. +Nn = noise items. "Counterpart outside slice" lists manifest nodes not in the slice; for journey roots (J.x) the relevant steps were usually inside (d01, d05, d09, d10, d11, d12, d17, d18, d19 all had the cited steps).

| id | cat | subt | Q | slice nodes | slice tok | counterpart outside slice | D | S | W |
|---|---|---|---|---|---|---|---|---|---|
| d01 | cross-reference | 2 |  | 61 | 11372 | J.control.block | hit (ung) | hit (g) | hit (g) |
| d02 | cross-reference | 1 |  | 138 | 21878 |  | hit (ung) | hit (g) | hit (g) |
| d03 | cross-reference | 2 |  | 59 | 11067 |  | hit (g) | hit (g) +1n | hit (g) |
| d04 | cross-reference | 2 |  | 77 | 13907 |  | hit (ung) | hit (g) | hit (g) |
| d05 | cross-reference | 2 |  | 84 | 15574 | J.control.block | hit (g) | hit (g) | hit (g) |
| d06 | cross-reference | 2 |  | 26 | 3902 |  | hit? (ung) | hit (g) | hit (g) |
| d07 | cross-reference | 1 |  | 63 | 11045 |  | hit (ung) | hit (g) | hit (g) |
| d08 | cross-reference | 1 |  | 31 | 5926 | hook.webapp.lifecycle.data | hit (ung) | hit (ung) | hit (g) |
| d09 | cross-reference | 2 |  | 79 | 12710 | J.control.export, J.control.delete | hit (ung) | hit (g) | hit (g) |
| d10 | cross-reference | 2 |  | 78 | 13847 | J.contacts | hit (ung) | hit (g) | hit (g) +1n |
| d11 | semantic | 2 |  | 62 | 11725 | J.contact | hit (ung) | hit (g) | hit (g) |
| d12 | semantic | 1 |  | 16 | 2239 | commitment.personal-initiation, J.contact, T2 | hit (ung) | hit (g) +1n | hit (g) |
| d13 | semantic | 2 |  | 20 | 2389 | commitment.finite-incoming | hit (ung) | hit (g) | hit (g) |
| d14 | semantic | 2 |  | 8 | 1036 | entity.RelationshipGoal, P1, commitment.owner-cadence | hit (ung) | hit (ung) | hit (g) |
| d15 | semantic | 3 |  | 23 | 4546 | hook.webapp.schedule.correct | hit (ung) | hit (g) | hit (g) |
| d16 | semantic | 2 | Q | 17 | 3377 | S.webapp.scope | MISS +1n | hit (g) +1n | hit (g) +1n |
| d17 | semantic | 2 |  | 29 | 5942 | J.control.disconnect | hit (ung) | hit (g) +1n | hit (g) +1n |
| d18 | semantic | 2 |  | 53 | 9959 | J.control.delete | hit (ung) | hit (g) | hit (g) |
| d19 | semantic | 2 |  | 19 | 3734 | J.control.disconnect, P1 | hit (ung) | hit (g) +1n | hit (g) +1n |
| d20 | semantic | 3 |  | 13 | 2233 | commitment.one-to-one, C.system.topology, C.webapp.outgoing.single | MISS +1n | hit (g) +1n | hit (g) +2n |
| d21 | local | 1 |  | 15 | 2874 |  | hit (g) | hit (g) | hit (g) |
| d22 | local | 1 |  | 5 | 909 |  | hit (g) | hit (g) | hit (g) |
| d23 | local | 3 | Q | 1 | 121 |  | hit (g) | hit (g) | hit (g) |
| d24 | local | 1 |  | 67 | 12310 |  | hit (g) | hit (g) | hit (g) |
| d25 | local | 2 |  | 6 | 962 |  | hit (g) | hit (g) | hit (g) |
| d26 | local | 2 |  | 46 | 9076 |  | hit (g) | hit (g) | hit (g) |
| d27 | local | 2 |  | 56 | 10052 |  | hit (g) | hit (g) | hit (g) |
| d28 | local | 2 | Q | 26 | 4429 |  | hit (g) | hit (g) | hit (g) |
| d29 | local | 2 |  | 17 | 3192 |  | hit (g) | hit (g) | hit (g) |
| d30 | local | 2 | Q | 5 | 680 |  | hit (g) | hit (g) | hit (g) |
| c01 | control | 1 |  | 44 | 7580 |  | ok | ok | ok |
| c02 | control | 1 |  | 5 (fallback) | 116 |  | ok | ok | ok |
| c03 | control | 1 | Q | 36 | 7515 |  | ok | ok | ok |
| c04 | control | 1 |  | 58 | 10899 |  | ok | ok | ok |
| c05 | control | 1 |  | 19 | 2157 |  | ok | ok | ok |

## E2 totals (hits/N)
| slice | D | S | W | D excl Q | S excl Q | W excl Q |
|---|---|---|---|---|---|---|
| all defects | 28/30 | 30/30 | 30/30 | 25/26 | 26/26 | 26/26 |
| cross-reference | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| semantic | 8/10 | 10/10 | 10/10 | 8/9 | 9/9 | 9/9 |
| local | 10/10 | 10/10 | 10/10 | 7/7 | 7/7 | 7/7 |
| subtlety 1 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 |
| subtlety 2 | 19/20 | 20/20 | 20/20 | 17/17 | 17/17 | 17/17 |
| subtlety 3 | 2/3 | 3/3 | 3/3 | 1/2 | 2/2 | 2/2 |
strict (borderline=miss): D 27/30 S 30/30 W 30/30

- Strict (borderline d06-D counted as miss): D 27/30, S 30/30, W 30/30.
- Grounded hits on cross-reference + semantic (n=20): **D 2/20, S 18/20, W 20/20** (excl. d16: 2/19, 17/19, 19/19). D's two grounded hits are d03 (the defect is internal to the new node) and d05 (the removed line carries a comment quoting S.webapp.prompts).
- Control false alarms: D 0/5, S 0/5, W 0/5 (excl. c03: 0/4 each). Every arm said "ok" with zero items on every control.
- Verdict alone is saturated: every arm answered "problem" on all 30 defects and "ok" on all 5 controls, so binary recall does not discriminate the arms; the differences are in which items are correct and grounded.

| arm | mean input tok | mean output tok | mean cost/call | total (35) | mean latency | items on defects | noise | precision (on-target items / items) |
|---|---|---|---|---|---|---|---|---|
| D | 3,275 | 170 | $0.0245 | $0.86 | 2.7 s | 31 | 2 | 0.94 |
| S | 13,326 | 172 | $0.1050 | $3.67 | 2.5 s | 55 | 6 | 0.89 |
| W | 43,119 | 181 | $0.3435 | $12.02 | 2.7 s | 61 | 6 | 0.90 |

Input tokens include ~2.9k tokens of fixed CLI overhead per call (the D prompts are ~0.4k). Noise items were all plausible consequences of the change (e.g. d03 "ContactRecord has no archived field", d10 W "evolution.1 now depends on an op introduced in evolution.2", d17 "name 'Current revocation' now contradicts description"), not pre-existing issues; none was wrong.

### S vs W
S hit everything W hit. S was ungrounded where W was grounded on two variants, both because the counterpart was outside the slice:
- d08: the counterpart hook.webapp.lifecycle.data links to the criterion only through its `criteria` field, which the graph does not model as a link, so it never enters the slice; S said "likely an undefined reference". W named the dangling id and that the old hook still claims the criterion.
- d14: the slice was 8 nodes (journey steps + operation.invite.accept); entity.RelationshipGoal ("never exposed to its contact") and P1 were outside. S judged the privacy breach only against the removed text of the same line. W cited RelationshipGoal invariants and P1.
On d12, d13, d15, d16, d20 a manifest counterpart was outside the slice but S grounded the hit on another counterpart that was inside (e.g. d16 on P1; d20 on policy.pairConsent/topology rather than commitment.one-to-one).

### D's weaknesses (what context buys)
- Two misses with wrong nature: d16 (argued the indicator no longer measures effort; missed P1 non-goal / no in-app messaging) and d20 (argued unchecked preconditions; missed the one-to-one / no-bulk-send rule).
- 18/20 cross/semantic hits are guesses about the rest of the spec ("likely contradicts ... that still specify five"), some correct by luck, some with false side claims: d06 "x4 may not exist", d10 "operation.contact.log is likely not a defined operation" (it is), d07/d08 "likely broken".
- D invents node ids because it sees only a fragment: 'reminders', 'operation.connection.block', 'op.save_goal', 'entity.Interaction.occurredAt', 'C.webapp.policy.revocation', 'Current revocation', 'Delete', file paths. S and W used real ids.

## E2 borderline calls
- d06 D = hit? (main hit, strict miss): says x3 is skipped and orphaned, but the diff does not show x3's content and the item never mentions reauthentication, the point of the defect.
- d16 D = miss: item is about the indicator not measuring the outcome; manifest nature is "measures a non-goal / something the system does not offer". Counted as noise. (d16 is Q anyway.)
- d20 D = miss: item is about preconditions of other selected contacts, not bulk / one-to-many sending.
- d20 S = hit (g): "one-to-many outgoing action ... conflicts with the private-pairs topology and pair-consent policy". Same nature (bulk send vs one-to-one), cites topology rather than commitment.one-to-one.
- d14 S = hit (ung): right nature, argued from removed text.
- d08 S = hit (ung): hedged "likely an undefined reference".
- d19 S/W: the "affordance effect has no supporting write in operation.connection.revoke" items counted as noise (true, but not the manifest's "record remains" conflict); each arm had another on-target item (S J.control.disconnect/d3 + owner-controlled records; W J.control.disconnect goal/end + P1).
- d17 S3/W3 (name vs description) counted noise though arguably the same defect; would raise S/W precision to 0.91/0.92.
- d21 D: node given as operation.data.export but the text describes the Export affordance's emptied effects: hit.
- Wrong node ids in D (above) were not penalised; text identified the element.
- Controls: nothing borderline (no items at all).

## E3: finding ledger
Data: previous Arm B run-1 outputs (35 variants + clean) and 4 clean runs (run1 from the previous experiment, run2-4 new: `raw/e3/`). Script `scripts/e3.py`, output `e3.json`.

**Node-id validity** (540 Arm B run-1 items, checked against that variant's graph): exact 453/540 = **83.9%**; lenient **538/540 = 99.6%**. Nearly all non-exact values are bare journey step ids (`p3`, `s1`, `p4`, `s2`, `g5`, `x2`, `p2`, `e1`) that resolve via the item's `file` (journeys/J.prompts.yaml + p3 -> J.prompts/p3). The 2 unresolved are `required` in kits.yaml. On the 4 clean runs: exact 50/60, lenient 60/60.

**Pool stability** (4 clean runs, keyed by lenient node id): 28 distinct node ids in total (per run 15, 14, 15, 15). Appearing in 1 run: 11; 2 runs: 7; 3 runs: 6; all 4: 4 (component.PrivateNotes, evolution.2, J.prompts/p3, operation.data.delete). Keyed by exact problem text: 60 distinct strings, 0 repeated across runs.

**Ledger filter** on variant run-1 outputs (30 defects x 15 items = 450 items; 29 seeded hits; controls 75 items):

| ledger | size | items left per defect variant (mean / median) | seeded item survives | precision (seeded / shown) | control items left (all noise) |
|---|---|---|---|---|---|
| none | - | 15 / 15 | 29/29 | 29/450 = 0.064 | 75 |
| 1 clean run (run1) | 15 | 6.5 / 6 | 27/29 | 27/195 = 0.138 | 35 |
| 1 clean run (range over run1..run4) | 14-15 | 6.1-6.9 | 27-28/29 | 0.130-0.154 | 35-39 |
| 2 clean runs (run1+2) | 21 | 4.6 / 5 | 26/29 | 26/138 = 0.188 | 28 |
| 2 clean runs (run3+4) | 22 | 3.7 / 4 | 27/29 | 27/112 = 0.241 | 26 |
| 4 clean runs | 28 | 3.07 / 3 | 26/29 | 26/92 = 0.283 | 24 |

Excluding Q variants, recall after the 4-run ledger is 22/25 (before 25/25).

Wrongly suppressed seeded defects (their node already carried a known, different issue): **d09** (component.PrimaryNav: clean issue "header says PrimaryNav is not redeclared"), **d18** (operation.data.delete: clean issue "writes only Account/ContactRecord/NotificationJob"), **d29** (C.webapp.revocation.current: clean issue about autonomy `satisfies` coverage, appears in run2). d18 is suppressed by every ledger, since that node is in all 4 clean runs.

Text-keyed ledger (no graph): ledgers of 15/30/60 exact strings suppress 0, 1 and 2 of the 525 variant items; recall stays 29/29 and items per defect stay 15. So exact-text identity does nothing.

What survives the 4-run ledger is still mostly pre-existing issues: in c01/c03/c05 the 15 surviving items include recurring pool issues anchored on a *different* node than in the clean runs (unpinned auth kit as `auth`; hook-trigger gap as C.system.structure vs hook.system.overlap; linkedAccountId never set as entity.ContactRecord vs operation.invite.accept; S.webapp.screens missing as J.connect vs J.connect/s1), plus pre-existing issues that none of the 4 clean samples happened to list (event-deletion recompute, NotificationPreferences operation). The issue-to-node anchoring is not stable, and the 15-item pool is a sample of a larger set (28 distinct ids after 4 runs, still growing: +6, +5, +2 new ids for runs 2, 3, 4).

## Totals with and without questionable variants
E2 recall incl./excl. Q (d16 d23 d28 d30): D 28/30 vs 25/26, S 30/30 vs 26/26, W 30/30 vs 26/26; false alarms 0/5 vs 0/4 for all arms. E3 recall after 4-run ledger 26/29 vs 22/25.

## Spend
E2: 105 calls, $16.56 (D $0.86, S $3.67, W $12.02). E3: 3 calls, $1.36. Total **$17.92**.

## What went wrong / caveats
- One D call (d08.D) hung with no output; killed by the 600 s timeout in call2.sh and retried successfully (4 s). The xargs batch that contained it outlived the 10-minute tool window and finished in the background; the remaining batches ran in the foreground.
- E2 calls were fast (2-6 s, ~170 output tokens) while the whole-spec 15-item calls took ~53 s: the CLI used little or no extended thinking on the short JSON task. Same flags as before.
- Ceiling: the seeded edits are all visibly a change of meaning and the controls are visibly harmless, so even the diff-only arm gets verdicts right; the benchmark cannot show recall differences on verdicts.
- Single scorer, not blinded. Grounded/ungrounded is my judgement per the rubric.
- E3 uses one run-1 sample per variant; the ledger results depend on which clean runs form the ledger (shown as ranges).
