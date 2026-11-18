# Hard change-review benchmark (seeded defects)

A test set for reviewing changes to the keep-in-touch app spec. It has 36 change sets. Each is a realistic piece of feature work applied to the clean system (`../killtest/clean`, 302 nodes and 467 links once loaded). 28 sets carry exactly one seeded inconsistency, 7 in each of four classes. The other 8 are clean controls.

## What a reviewer may see

Only `variants/<id>/`, `diffs/<id>.diff` and `public.json` (the shuffled id list). Each id is a random 6-hex string and says nothing about the class.

Everything else is answer-key material: `manifest.json`, this README's tables, `scripts/` (in particular `scripts/variants_def.py`) and `work/`.

## Method

1. **Authoring.** `scripts/variants_def.py` defines every change set as exact-once text replacements, plus new files where needed. `scripts/gen.py` copies the clean system and applies the edits. It fails if any `old` string does not occur exactly once, or if a set has fewer than 4 or more than 9 edits, or touches fewer than 3 files. It then writes `diffs/<id>.diff` (`diff -ruN` with prefixes normalised to `a/` and `b/`). Ids are stored in `work/ids.json` and reused, and the shuffle in `public.json` stays stable across regenerations.
2. **Loading and slice.** `scripts/lib.ts` is an independent implementation of the pre-registered slice rule S. It does not import the change-review command's slice code.
   - C is every node added, removed or changed by `diff()`, plus both endpoints of every added, removed or changed link. If C is empty, it falls back to ids quoted verbatim in the diff; no set needed this.
   - The slice is C, plus the ancestors of C, plus the direct children of C, plus every node within 2 link hops. Hops are counted over the variant graph's links plus the removed links. Nodes of kind system, thing, section, template and kit can be reached but are never expanded.

   `scripts/analyze.ts` loads every variant (all 36 load), computes C, the slice and, for each declared counterpart: slice membership, blocked-aware hops, raw hops (with blocked kinds expanded), family relation, and one shortest path. Output goes to `work/analysis.json`. `scripts/probe.ts <set> <node>...` checks any other node.
3. **Linter.** `scripts/lint_all.py` runs `npm run lint:system -- <dir> --templates … --json` on the clean system and on every variant, and compares findings by (level, rule, subject). The clean baseline has 37 findings: 6 missing, 17 warnings and 14 info.
4. **Answer key.** `scripts/build_manifest.py` joins the definitions, the analysis and the linter deltas into `manifest.json` and regenerates the tables below.

Rebuild everything from the `scripts/` directory:

```
python3 -I gen.py
node --experimental-transform-types --import <ontology-engine>/bin/ts-resolve.mjs analyze.ts
python3 -I lint_all.py
python3 -I build_manifest.py
```

## Class definitions as used

- **I (internal).** Two edits of the same change contradict each other. Both sides are in C, so hops are 0.
- **N (near).** One side is changed. The counterpart is pre-existing, unchanged text inside the slice: within 2 link hops, or a parent or child of a changed node. In N1 and N6 the counterpart node is in C only because the change added a link to it or edited another field of it. The conflicting text itself is unchanged.
- **F (far).** The counterpart is at least 3 blocked-aware link hops from every node in C, is not an ancestor or direct child of one, and is outside the slice. The dependency runs along semantic link chains: invokes, writes, reads, stepOperation and stepNext. All 7 F counterparts sit at exactly 3 hops, blocked or raw.
- **U (unlinked).** The dependency exists only through free text, a literal (a route or a numeric range), a renamed id quoted in free text, containment, or a boundary or purpose statement. The counterpart is outside the slice. Three counterparts have no link path at all: U1, U7, and U2's hook. The others are reachable only incidentally, through hubs.
- **Controls.** These are correct changes. K1, K2, K4, K5, K6 and K7 deliberately look suspicious; the manifest explains why each suspicious edit is correct. K8 is a decoy that resembles U3.

## Counts and per-variant stats

<!-- STATS -->
| Class | Count |
|---|---|
| I | 7 |
| N | 7 |
| F | 7 |
| U | 7 |
| control | 8 |
| total | 36 |

| Class | Set | Id | Edits | Files | Changed nodes | Slice size | Min hops (blocked) | Min hops (raw) | Counterpart in slice | New linter rules |
|---|---|---|---|---|---|---|---|---|---|---|
| I | I1 | 27bc02 | 8 | 3 | 7 | 93 | 0 | 0 | yes | - |
| I | I2 | 474d5e | 6 | 3 | 5 | 73 | 0 | 0 | yes | - |
| I | I3 | 125d6e | 6 | 3 | 9 | 105 | 0 | 0 | yes | - |
| I | I4 | 6fa350 | 6 | 3 | 6 | 95 | 0 | 0 | yes | - |
| I | I5 | 46753b | 8 | 4 | 19 | 180 | 0 | 0 | yes | - |
| I | I6 | 45de63 | 8 | 4 | 16 | 139 | 0 | 0 | yes | flow.effectUnsurfaced |
| I | I7 | b434a4 | 6 | 4 | 14 | 167 | 0 | 0 | yes | - |
| N | N1 | dfba1a | 5 | 3 | 6 | 103 | 0 | 0 | yes | - |
| N | N2 | f80839 | 4 | 3 | 4 | 31 | 1 | 1 | yes | - |
| N | N3 | bc8433 | 4 | 4 | 6 | 94 | 1 | 1 | yes | - |
| N | N4 | ee73ec | 7 | 3 | 4 | 78 | 1 | 1 | yes | - |
| N | N5 | d1c15a | 6 | 3 | 5 | 75 | 1 | 1 | yes | - |
| N | N6 | 5cceea | 5 | 3 | 6 | 111 | 0 | 0 | yes | - |
| N | N7 | b6a5d0 | 5 | 4 | 5 | 75 | 1 | 1 | yes | - |
| F | F1 | 8fa895 | 8 | 3 | 6 | 83 | 3 | 3 | no | - |
| F | F2 | 089273 | 6 | 3 | 6 | 48 | 3 | 3 | no | - |
| F | F3 | 3a9735 | 4 | 3 | 4 | 56 | 3 | 3 | no | - |
| F | F4 | 08b2b8 | 6 | 3 | 6 | 102 | 3 | 3 | no | - |
| F | F5 | 864bc6 | 4 | 3 | 4 | 61 | 3 | 3 | no | - |
| F | F6 | e3bf46 | 7 | 3 | 6 | 91 | 3 | 3 | no | - |
| F | F7 | edd783 | 4 | 3 | 4 | 46 | 3 | 3 | no | - |
| U | U1 | f381ab | 5 | 3 | 6 | 63 | - | - | no | - |
| U | U2 | 774614 | 6 | 3 | 12 | 117 | 3 | 3 | no | hook.unbound,hook.unbound |
| U | U3 | 499fa7 | 4 | 3 | 4 | 68 | 3 | 3 | no | - |
| U | U4 | 643d59 | 6 | 3 | 6 | 96 | 3 | 3 | no | - |
| U | U5 | b7965d | 8 | 3 | 9 | 111 | 3 | 1 | no | semantic,flow.effectUnsurfaced,flow.orphanWrite,hook.unbound |
| U | U6 | 698e3b | 5 | 3 | 5 | 72 | 3 | 3 | no | - |
| U | U7 | 5f4559 | 5 | 3 | 5 | 70 | - | - | no | - |
| control | K1 | 9edff9 | 6 | 3 | 5 | 75 | - | - | - | - |
| control | K2 | cfc784 | 5 | 3 | 4 | 57 | - | - | - | - |
| control | K3 | 95dd79 | 4 | 3 | 3 | 50 | - | - | - | - |
| control | K4 | 04db7c | 5 | 3 | 5 | 73 | - | - | - | - |
| control | K5 | 22094b | 4 | 3 | 4 | 74 | - | - | - | - |
| control | K6 | aaf530 | 4 | 3 | 4 | 63 | - | - | - | - |
| control | K7 | 249a5b | 5 | 3 | 5 | 49 | - | - | - | - |
| control | K8 | 8ac67f | 4 | 4 | 4 | 61 | - | - | - | - |

| Class | Changed nodes, median (range) | Slice size, median (range) |
|---|---|---|
| I | 9 (5-19) | 105 (73-180) |
| N | 5 (4-6) | 78 (31-111) |
| F | 6 (4-6) | 61 (46-102) |
| U | 6 (4-12) | 72 (63-117) |
| control | 4.0 (3-5) | 62.0 (49-75) |
<!-- /STATS -->

## Linter

No variant's new findings point at its seeded defect, and no control gains a finding. The new findings are:

- **I6.** `flow.effectUnsurfaced` on the new Remove block affordance. The existing Block affordance has the same baseline warning.
- **U2.** `hook.unbound` for the renamed and new criteria. All clean hooks are already unbound, and the old one's finding disappears.
- **U5.** `flow.effectUnsurfaced` and `flow.orphanWrite`, because the recipient's view of a nudge is not modelled. `hook.unbound` for the new criterion. `semantic:topology.multiRecipient`, a heuristic asking about one-to-one delivery. That topic is adjacent to the defect, an in-app messaging scope exclusion, but it is not the defect. The baseline `node.provisional` finding for MessageDraft disappears.

Earlier drafts of I5, I6 and I7 added operations that no journey covered (`journey.operationUncovered`), so each now adds a short journey. U5 adds a `storedIn` link so the activated entity is stored.

## Borderline cases (honest notes)

- **F2 (one-tap join).** The shortest paths run through hubs (ext.providers and policy.authentication). The real coupling is that J.connect/s6 is a step on screen.signin, the grandparent of the changed affordance. This could be classed U.
- **F7.** The counterpart SchedulePreview is a sibling of the changed GoalForm. Siblings are outside rule S, but anyone reading the screen block sees them.
- **F3.** The 3-hop path depends on the change's own criterion edit.
- **F6.** Two of the three counterparts are reached through the GD refines hub and evolution.2.
- **U3 compared with F2.** Both stale items are journey steps on the screen that contains the changed field. U3 is labelled U because the stale item is a range literal; F2 is labelled F because the stale item is behavioural.
- **U5.** The raw distance is 1, through thing.webapp (a blocked kind in C because of the new criterion's owner link). The blocked-aware distance is 3.
- **U6.** The unambiguous counterpart is MetGoalCheckbox, which says "defaults unchecked", has no links and sits outside the slice. A softer counterpart, the explicit-marking invariant on entity.ContactEvent, is inside the slice at 2 hops. Whether a carried-over tick violates "explicitly marks" is arguable.
- **Size signal.** I sets change more nodes (median 9) than controls (median 4), mostly because they add operations and journeys. Controls are slightly smaller on average.
- **Detection without the defect.** I5's operation offers a 30-day restore, but no restore control exists. That gap is part of the same seeded contradiction, not a second defect.
