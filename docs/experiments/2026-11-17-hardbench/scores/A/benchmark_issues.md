# Benchmark issues (scorer A)

All scoring follows the manifest. These are places where the change sets carry more, or less, than the manifest says. Every item was verified against the variant YAML; claim ids refer to extras_ledger.json.

## Defect variants with a second, independent defect (not intended by the manifest)

| Variant | Class | Claim | Issue | Outputs flagging it |
|---|---|---|---|---|
| 27bc02 | I | 27bc02-c1 | `ContactRecord.birthday` is typed `local-date` (a full date) while BirthdayField and C.webapp.contact.save define a month-day birthday whose year may be blank. A yearless birthday cannot be stored as specified. | 6/6 |
| dfba1a | N | dfba1a-c1 | J.connect/s1 now offers Resend, but its only successor s2 runs operation.invite.create, which contradicts Resend's "no new invitation is created". | 6/6 |
| dfba1a | N | dfba1a-c2 | The Resend precondition needs a pending invitation "for this contact", but ConnectionInvite has no ContactRecord reference. Minor. | 4/6 |
| f381ab | U | f381ab-c1 | HistoryRow.open navigates to `/people/:id/events/:eventId`, which no screen declares, and the hook fixture claims to cover it. A second dangling route sits beside the seeded stale `/log` route. | 6/6 |
| b434a4 | I | b434a4-c1 | operation.account.setTimeZone declares a stale-version conflict, but entity.Account has no version field. Minor. | 4/6 |
| 08b2b8 | F | (scorer-found, no output) | The edited GD.connect summary in description.yaml adds unquoted commas inside a YAML flow mapping. yaml.safe_load truncates the summary and creates the stray keys "which removes that person" and "or block.". The clean GD.connect parses correctly, so this is a new parse defect. | 0/6 |

## Seeded edits that contradict a second unchanged statement (second manifestations)

These come from the same root edit, so fixing the seeded defect fixes them too. They are not listed among the manifest's counterparts. A reviewer who reports one of them has found a real problem but did not match the manifest.

- **089273 (F), 089273-c2.** The ConsentPanel is now shown only to invitees who are already signed in. That contradicts its unchanged cardinality "exactly one after validation" and screen.invitation's "Exactly InvitePreview and ConsentPanel after validation". (4/6)
- **edd783 (F), edd783-c1.** The post-save SchedulePreview lives on screen.goal, but J.goals g5 then e1 lands on screen.person, so the preview is never shown. (3/6)
- **643d59 (U), 643d59-c1.** Saving a goal now requires entity.Connection, but evolution.2 (goals) comes before evolution.3, which introduces Connection. (3/6)
- **643d59 (U), 643d59-c2.** Snooze, pause and revise all go through operation.goal.save, so they fail for contacts with no active Connection. That breaks J.prompts p5 to p7. (4/6)

## Candidate issues I could not settle (labelled unclear)

- **8fa895 (F), 8fa895-c1.** S.webapp.prompts now suppresses suggestions only "until the block lapses", but nothing unpauses the goal when the block lapses. The edit has no mechanism behind it. (6/6 flagged it)
- **8ac67f (control), 8ac67f-c2.** C.webapp.schedule.correct now reads "interval preset and depth changes". That can be read as dropping typed intervals from fixture coverage. The wording is ambiguous rather than contradictory. (3/6)

## Controls

- All 8 controls are semantically clean as far as I could verify. Every extra on 04db7c, 22094b, 249a5b and 95dd79 is false.
- **8ac67f.** The edited GD.goals summary sits inside a YAML flow mapping with unquoted commas, so the new "chosen from presets or typed" text parses as a stray key (verified with yaml.safe_load). The clean GD.goals already truncates at its comma ("with a schedule preview." is lost), so I labelled the defect real-preexisting. It still means 3 of the outputs that flagged 8ac67f found a true problem, and the control edit makes it worse. Consider quoting description.yaml summaries in both the base and the variants.
- 9edff9 (depth rename): no stale old labels remain apart from ordinary English uses of "meaningful" in purpose.yaml and theory.yaml. aaf530 and cfc784: no leftover contradicting statements.

## Classes and seeded defects

- I found no seeded defect that fails to be a defect, and no wrong class. Two grounding notes affect how found or grounded is read:
  - **F2 / 089273.** The decisive counterpart is S.webapp.authentication / J.connect, the explicit-accept requirement. Outputs that cite only screen.invitation or policy.pairConsent were scored partial.
  - **U6 / 698e3b.** The ContactEvent invariant counts only as a soft counterpart; it gets partial unless a listed node is named.
- **5f4559 (U, calendar-aware suggestions).** The manifest's counterpart is the Externals boundary for ext.events. Five of six outputs instead reported the real seeded-symptom that no operation carries calendar data to the server (5f4559-c1), without naming the boundary. Under the rubric that is not found. The defect is subtle but valid.
