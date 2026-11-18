# Scoring rubric (written before scoring)

Applied uniformly to all 216 outputs. Scorer is blind to arm.

## Defective variants

**found** (true/false). A finding matches the seeded defect when its summary states the actual inconsistency from the manifest: the changed behaviour AND the property it violates (the rule/text it conflicts with), in substance. Examples of what counts:
- Says the changed element now does X and that X conflicts with a stated rule/step/invariant/enum/route that says otherwise, where that conflict is the manifest's conflict (possibly worded differently).
- For internal (I) defects: names the two halves of the change that disagree, on the manifest's axis (e.g. "optional birthday vs. Save precondition requires birthday").
Does NOT count:
- Pointing at the changed node with a different complaint (e.g. missing link, missing failure handling) or a vague "may be inconsistent" with no statement of the conflicting property.
- Naming the counterpart node but complaining about something unrelated to the seeded axis.
A finding that states the right conflict but cites a softer counterpart still counts as found (grounded = partial).

**rank**. 1-based index of the first matching finding in the findings list; null if not found.

**grounded** (only when found).
- `yes`: the matching finding cites at least one manifest counterpart node id in nodeIds or summary, or unambiguously describes a manifest counterpart's content (e.g. "the journey still ends 'Block in force until removed'" for J.control.block/e1).
- `partial`: asserts that the conflict exists against something elsewhere without identifying a manifest counterpart, or names only a softer/secondary counterpart that is not in the manifest's counterpart list (e.g. a sibling requirement that also states the rule, or S.webapp.qualification's "explicit marking" for U6 counts as listed so is yes; a non-listed node expressing the same rule is partial).
- `no`: found the defect as a problem, but gives no counterpart at all (e.g. "this contradicts the spec" with nothing named, or only describes the changed side as self-evidently wrong).
For I-class, counterparts are the manifest's counterpart list; citing either half of the internal contradiction that is listed as counterpart counts as yes; citing only the changedSide plus an unlisted node that also states the other half counts as partial.

Unlisted nodes that state exactly the same rule as a listed counterpart and that the manifest names in its defect text (e.g. C.webapp.lifecycle.data for F6, screen.settings for f80839, C.webapp.schedule.correct) count as `yes`, because the manifest's defect text names them.

**verdictCorrect**: verdict == "defect".

## Controls

**verdictCorrect**: verdict == "clean". found/rank/grounded are null.

## Extras

Every finding other than the first matching finding is an extra (a second finding that restates the same seeded defect is labelled `dup-seeded` and not counted as false; it is reported separately).
Labels:
- `real-preexisting`: a true problem already present in the clean spec (verified in `killtest/clean`).
- `real-introduced`: a true problem the change set introduces that the manifest did not intend (verified in the variant/diff). Must be an actual inconsistency or broken behaviour, not a stylistic gap.
- `false`: wrong on the facts, or a nitpick/taste/missing-link complaint without a real inconsistency (e.g. "should also have a criterion", "missing failure handling" where nothing contradicts).
- `unclear`: plausible but not decidable from the spec text, or a genuine judgement call.
- `dup-seeded`: restates the seeded defect (not counted against the output).

Claims are deduplicated into a ledger per variant (claimId `<variant>-<n>`); recurring cross-variant claims are noted. Each claim is adjudicated once against the actual YAML and applied consistently.

Bar for `real-introduced`: the change creates a contradiction between two statements in the variant, or a specified behaviour that cannot work given other text in the variant. Missing links / missing optional detail alone = false. Where the manifest's controls README explains a suspicious edit as correct, I verify the explanation, and label accordingly.

## Addendum (fixed after reading the first variant, before scoring it; applies to all)

Extras keep the four labels, with a `subtype` on `real-introduced`:
- `seeded-symptom`: a true observation that follows only from the seeded change and disappears when the seeded defect is fixed (e.g. "the affordance now accepts invitations but has no invokes link to operation.invite.accept"). It does not state the seeded inconsistency, so it does not count as found, and it is not a second benchmark defect.
- `second-manifestation`: the seeded change also contradicts another unchanged statement that the manifest does not list (a real additional inconsistency from the same root edit). Flagged in benchmark_issues.
- `independent`: an unintended, separate defect. Flagged in benchmark_issues.
A finding that restates the seeded defect after the first matching finding is `dup-seeded` (not an extra for counting purposes).
Missing links or missing failure handling alone, on nodes the change did not make behave differently, are `false`.
