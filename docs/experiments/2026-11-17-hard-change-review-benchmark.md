# Harder change-review benchmark: multi-edit changes, counterparts outside the slice

Date: 2026-11-17. Command under test: `npm run review:change` (commit `a7f219f`). Data: [2026-11-17-hardbench](2026-11-17-hardbench/README.md).

## Question

The earlier change-scoped experiment could not separate the arms on recall (diff only 28/30). Does the diff plus a graph slice still match the diff plus the whole spec when changes are multi-edit and the conflicting counterpart is not next to the change?

## Method

- **Benchmark.** A seeding agent, with no access to model calls, wrote 36 change sets on keep-in-touch (302 nodes). Each is 4 to 9 coordinated edits across at least 3 files. 28 carry exactly one seeded inconsistency, 7 per class; 8 are clean controls, six of them deliberately suspicious-looking.
  - **I (internal):** two of the change's own edits contradict each other.
  - **N (near):** the unchanged counterpart is inside the slice (0 to 1 link hops).
  - **F (far):** the counterpart is exactly 3 link hops away, outside the slice.
  - **U (unlinked):** the counterpart is outside the slice and tied only by text, a field value or containment.
- **Slice rule.** Unchanged from the pre-registration: changed nodes, ancestors, direct children, 2 link hops, no expansion through system/thing/section/template/kit. The seeder knew the rule and built F and U to fall outside it. Its independent implementation agreed with the command's.
- **Arms.** One Opus call each through the command: `--mode diff`, `--mode slice`, `--mode whole`, plus slice with the old reply format, plus a second repetition of diff and slice. 216 calls. A leak check over all 144 prompts found no variant id or path.
- **Scoring.** Two scorers worked independently from the answer key, blind to the arm (severity and evidence were stripped so the old reply format could not be told apart). "Found" requires stating the actual inconsistency. "Grounded" requires naming the manifest's counterpart. One scorer also adjudicated every extra finding against the YAML.

## Results

Found, by class (rater A / rater B where they differ):

| Arm | I | N | F | U | All 28 | Grounded (A / B) | $ per call | Prompt tokens |
|---|---|---|---|---|---|---|---|---|
| Diff only | 7 | 6 | 4 / 5 | 2 | 19 / 20 | 13 / 12 | 0.041 | 1.0k |
| Diff only, rep 2 | 7 | 5 | 2 / 6 | 2 | 16 / 20 | 10 / 10 | 0.042 | 1.0k |
| Diff + slice | 7 | 7 | 4 | 2 | 20 | 15 / 14 | 0.216 | 15.5k |
| Diff + slice, rep 2 | 7 | 7 | 3 | 2 | 19 | 15 / 14 | 0.216 | 15.5k |
| Diff + slice, old reply format | 7 | 7 | 2 | 2 | 18 | 16 / 14 | 0.210 | 15.5k |
| Diff + whole spec | 7 | 7 | 7 | 7 | 28 | 28 / 28 | 0.364 | 28.0k |

- The raters agreed on found for 163 of 168 outputs and on grounding for 112 of the 120 both counted as found. All five disagreements are hedged diff-only findings on F defects.
- Across all arms the verdict was "defect" on 158 of 168 defective outputs; 38 of those verdicts were for some other reason. The verdict alone overstates detection.
- Five of the seven U sets were found only by the whole-spec arm. Two of them drew a "clean" verdict in 5 of 6 outputs.

Controls and extra findings:

- One control (`8ac67f`) carries an accidental YAML formatting defect. On the other seven, controls passed as clean: diff 5 and 4, slice 4 and 5, old reply format 4, whole spec 4.
- Extra findings judged false (rater A), per 36 reviews: diff 32 and 34, slice 35 and 31, old format 31, whole spec 31. That is about one false finding per review in every arm.
- The diff arms cited node ids that exist in neither graph in 11 of 36 outputs each; the slice arms in none; whole spec in one.
- The old and new reply formats behaved the same on controls, so the control false alarm seen while building the command was not caused by the format.

Slice size: 31 to 180 of 302 nodes (most 60 to 110), against a median of 29 on single-edit changes. The slice prompt is 55% of the whole-spec prompt and 59% of its cost.

Total model spend: $39.19, plus $0.37 for the three live checks of the command.

## Findings

1. **Diff plus whole spec is the only arm that holds up.** It found and grounded all 28. The slice arm found 18 to 20.
2. **The slice helps only when the counterpart is inside it.** On N it found and grounded 7/7 where the diff alone found 5 to 6 and grounded 2 to 4. On F and U it is no better than the diff alone. The 2-hop link rule misses anything tied by text, field value or containment, and anything 3 hops out.
3. **The cost case for the slice is weak at this spec size.** Multi-edit changes pull in a third of the graph, so the slice saves about 40% of the cost and loses 30% of the defects. The saving was real on the 3x spec (one eighth of the cost), but that was measured on single-edit changes with near counterparts.
4. **False alarms are the larger product problem.** Every arm produces about one false finding per review and flags roughly 40% of clean changes. More context does not reduce this.

## Limits

- The seeder designed F and U against the slice rule, so the slice arm's miss rate there is by construction; the informative result is that the diff alone does no better and the whole spec recovers all of them.
- One spec, one domain, one model. One call per cell except the two repeated arms.
- The benchmark has unintended second defects in five sets (`27bc02`, `dfba1a`, `f381ab`, `b434a4`, `08b2b8`) and second manifestations of the seeded defect in three; see [benchmark issues](2026-11-17-hardbench/scores/A/benchmark_issues.md). Scoring followed the manifest. These do not affect the found counts but do affect how extras are read.
- F counterparts all sit at exactly 3 hops: hub nodes put almost everything within 2 hops, so nothing plausible is farther.
- I sets change more nodes than controls (median 9 against 4).
- Findings are ordered within severity only; exact model order was not kept.

## Next

- Make `--mode whole` the default while the spec fits comfortably in one prompt; keep the slice for specs that do not.
- If the slice is to be kept for larger specs, its rule needs text and field coupling, not more link hops. Candidates: treat field references and shared literals as edges; or give the reviewer the slice plus a tool to fetch further nodes.
- Work on precision before recall: about one false finding per review and 40% of clean changes flagged will stop anyone using this.
