# Blind scoring, rater B

216 outputs, 6 per variant. Scored by reading each finding against the manifest and, where needed, the variant YAML.

## Defective variants (28 sets, 168 outputs)

| Class | Outputs | Found | Rank 1 | Grounded yes | Partial | No | Verdict clean |
|---|---|---|---|---|---|---|---|
| I | 42 | 42 | 42 | 40 | 2 | 0 | 0 |
| N | 42 | 39 | 38 | 33 | 6 | 0 | 0 |
| F | 42 | 27 | 24 | 10 | 14 | 3 | 0 |
| U | 42 | 17 | 17 | 9 | 8 | 0 | 10 |
| all | 168 | 125 | 121 | 92 | 30 | 3 | 10 |

Per set (found / 6, grounded yes):

- I: 125d6e 6/6 (4 yes); 27bc02 6/6 (6 yes); 45de63 6/6 (6 yes); 46753b 6/6 (6 yes); 474d5e 6/6 (6 yes); 6fa350 6/6 (6 yes); b434a4 6/6 (6 yes)
- N: 5cceea 6/6 (6 yes); b6a5d0 6/6 (4 yes); bc8433 6/6 (4 yes); d1c15a 4/6 (4 yes); dfba1a 5/6 (5 yes); ee73ec 6/6 (6 yes); f80839 6/6 (4 yes)
- F: 089273 4/6 (2 yes); 08b2b8 6/6 (1 yes); 3a9735 5/6 (2 yes); 864bc6 3/6 (1 yes); 8fa895 3/6 (1 yes); e3bf46 3/6 (1 yes); edd783 3/6 (2 yes)
- U: 499fa7 1/6 (1 yes); 5f4559 1/6 (1 yes); 643d59 6/6 (1 yes); 698e3b 6/6 (3 yes); 774614 1/6 (1 yes); b7965d 1/6 (1 yes); f381ab 1/6 (1 yes)

## Controls (8 sets, 48 outputs)

- Outputs with any finding: 20/48. Findings: 45, of which real 4, false 41.
- 04db7c (Choose the hour of the daily reminder): 5/6 flagged; findings 14, real 0
- 22094b (JSON or CSV export): 6/6 flagged; findings 14, real 0
- 249a5b (Search contacts by channel): 3/6 flagged; findings 7, real 1
- 8ac67f (Interval presets): 4/6 flagged; findings 6, real 3
- 95dd79 (Snooze for 1, 3 or 7 days): 2/6 flagged; findings 4, real 0
- 9edff9 (Rename the depth labels): 0/6 flagged; findings 0, real 0
- aaf530 (Keep private goals running after disconnect): 0/6 flagged; findings 0, real 0
- cfc784 (Purge deleted accounts within 72 hours): 0/6 flagged; findings 0, real 0

## Conventions used

- A finding counts as found when it states the seeded conflict's content. I still counted it when the reviewer hedged ("likely", "may conflict") and named the right rule. In those cases grounded is partial if the location given is roughly right and no if no location is given or the node named is wrong. There are 9 hedged finds: F 7 (0ece7398, 578699c5, c00423c4, 065e8a31, e0bc408c, 8d9e63be, 6923dab5), N 1 (d8751f4e) and U 1 (98069151). Without them, found is I 42, N 38, F 20, U 16 (116/168).
- Grounded partial also covers secondary counterparts the manifest mentions but does not list as main: GD.contacts for 08b2b8 and 643d59, the ContactEvent invariant for 698e3b, journey b5 for 8fa895, ConsentPanel/explicit accept for 089273, and the affordance's own "owner only" effect for f80839.
- Controls: a hook fixture that tests more than its criterion claims, an operation that does not repeat an affordance effect, or an unspecified edge case is false. Real means an actual contradiction or breakage in the variant.
- Control validity: 8ac67f's GD.goals edit adds unquoted commas inside a YAML flow mapping, and yaml.safe_load truncates the summary to "An owner-only goal with an interval". The base was already truncated at its one comma, but the edit drops "desired depth" from the parsed text. Three outputs report this and are scored real. The defect is in the YAML formatting, not the spec's meaning.

## Hard-to-call outputs

- 28e7e172 (F, 8fa895): [2] journey b5 states refusal without time limit; not e1 'until removed'
- 12ef28cc (N, bc8433): asserts 'owner reminders should not carry contact details' without locating rule
- aab99379 (F, e3bf46): says screen.today/requirements not updated and ordering untraced; no conflict claimed
- 9aacf5df (F, 089273): [2] says sign-in invitees skip ConsentPanel Accept/Decline and weakens explicit consent; counterpart named is screen.invitation/policy.pairConsent, not S.webapp.authentication/J.connect/s6
- 1d5a67ff (N, dfba1a): [3] no ConnectionInvite field keeps the code retrievable (cites entity.ConnectionInvite); hedged, no hash wording
- 16fca1b1 (control, 8ac67f): [1] real: plain-scalar commas in flow mapping; YAML parses GD.goals summary as 'An owner-only goal with an interval' and drops 'desired depth' (base already truncated at the last comma)
- 578699c5 (F, 864bc6): hedged: 'operation and any redemption flow that depend on a displayed QR'; operation.invite.create has no QR text; s3 not named
- 001ec5be (F, 089273): only ConsentPanel cardinality conflict and missing invokes link; never says auto-accept bypasses consent/preservation
- 59a29393 (control, 8ac67f): YAML flow-mapping truncation, verified with yaml.safe_load
- 62c5b110 (F, 3a9735): points at InvitePreview on screen.invitation but claims nothing says what it shows (it says inviter is shown)
- 962f35e3 (U, 698e3b): cites MetGoalCheckbox but frames 'defaults unchecked' as replaced rather than still stated
- d8751f4e (N, bc8433): hedged: 'likely breaks the spec's privacy and minimal-content rules for external reminders'
- 8d9e63be (F, edd783): hedged 'likely', but names SchedulePreview's preview-before-commit role
- c48187db (N, b6a5d0): counting-match conflict in S.webapp.qualification; never mentions ContactEvent.qualifiedDepth enum
- 065e8a31 (F, e3bf46): hedged: Today screen and suggestion-ordering spec 'may conflict'
- 0ece7398 (F, 3a9735): hedged: 'probably conflicts with any accept/redeem flow that shows the inviter'; no node
- bd445952 (control, 249a5b): [2] criterion 'search' state absent from screen.people states, but base criterion already names 'dialog' which is also absent
- 0af81682 (F, 8fa895): [1] cites source sections; [3] b5 no time bound
- 98069151 (U, 643d59): hedged: 'likely contradicts the core goal flow which needs only an owned contact'
- 2f654a7f (U, 698e3b): [1] cites MetGoalCheckbox (risk framing); [3] states the exact stale-component mismatch
- ff708d2d (N, b6a5d0): counting-match conflict; [2] 'records the value any' but no enum/ContactEvent
- e0bc408c (F, e3bf46): hedged: 'may conflict with any existing ordering rule'
- 662cd8d8 (control, 8ac67f): [1] YAML truncation real; [2] wording narrowing not a conflict
- c448e145 (control, 249a5b): [1] real minor: C.webapp.screen.people now claims search state but hook.webapp.screen.people fixture enumerates 'loaded, empty, loading, error, dialog' without search; [2] same 'dialog' precedent as bd445952
- 5e18e657 (F, 3a9735): same as 62c5b110: InvitePreview named, content claimed unspecified
- 485cab8e (control, 249a5b): [1] 'dialog' precedent; [2] hook broader than claim; [3] underspecified no-match state
- c00423c4 (F, 864bc6): hedged: operation.invite.create/'redemption flow' 'appear built around' QR shared in person; wrong node, s3 not named
- 6923dab5 (F, edd783): hedged: 'likely breaks any part of the spec that relies on previewing before confirming'; no node
