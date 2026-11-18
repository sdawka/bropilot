# Builds manifest.json (answer key) from variants_def.py + work/analysis.json + work/lint_delta.json,
# and writes the generated tables into README.md between the STATS markers. Run: python3 -I build_manifest.py
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); HB = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from variants_def import V  # noqa: E402

ids = json.load(open(os.path.join(HB, "work", "ids.json")))
an = json.load(open(os.path.join(HB, "work", "analysis.json")))
lint = json.load(open(os.path.join(HB, "work", "lint_delta.json")))
public = json.load(open(os.path.join(HB, "public.json")))

BORDER = {
 "F2": "Both shortest paths run through hubs: to J.connect/s6 via ext.providers (both reference it), to S.webapp.authentication via policy.authentication. The real coupling is containment plus a journey screen: s6 is a step on screen.signin, which is the grandparent of the changed affordance. Reasonable people could call this U.",
 "F3": "The 3-hop path to InvitePreview goes through the edited criterion C.webapp.connection.consent (subject operation.invite.accept). Without that edit the distance from the invite affordance alone would be larger.",
 "F6": "S.webapp.prompts is reached through the GD.prompts refines hub, and J.prompts/p2 through evolution.2's affects edges. The semantic chain RelationshipGoal to Suggestion to SuggestionCollection is not a direct link, because Suggestion has no link to RelationshipGoal.",
 "F7": "SchedulePreview is a sibling of the changed GoalForm: both are children of screen.goal. The slice includes ancestors and direct children but not siblings, so a reviewer who reads the whole screen block sees the conflict immediately.",
 "F1": "The journey node J.control.block has no links (journeys only connect through their steps), so only e1 has a hop count. In-slice neighbours b3 to b5 state no duration.",
 "F4": "Same as F1: J.control.disconnect, the journey node, has no links; e1 is 3 hops away along the step chain.",
 "U2": "C.system.autonomy is incidentally 3 hops away via screen.today, ext.owner and P1. The dependency itself sits in hook.system.autonomy's free-text inputs, which have no links, and in the claim text.",
 "U3": "J.goals/g3 is 3 hops away through evolution.2 and screen.goal. Structurally this resembles F2: a journey step on the screen that contains the changed field. It is labelled U because the stale item is a numeric range literal in free text.",
 "U4": "P1 is 3 hops away only through the ext.owner beneficiary hub. The dependency is a free-text constraint in purpose.yaml.",
 "U5": "S.webapp.scope's raw distance is 1, through thing.webapp: the new criterion's owner link puts thing.webapp in C, but blocked kinds are not expanded. It is also the subject of the sibling affordance PersonActionBar.openChannel. Under the pre-registered rule it is outside the slice.",
 "U6": "Secondary, softer counterparts carry the explicit-marking rule: entity.ContactEvent's invariant is inside the slice (2 hops) and affordance.ContactEventForm.save is outside it (3 hops). Whether a carried-over tick violates 'explicitly marks' is arguable. The unambiguous conflict is MetGoalCheckbox's 'defaults unchecked', which is outside the slice and has no links.",
 "N1": "entity.ConnectionInvite is in C only because the new affordance adds a reads link to it. Its 'stores only a token hash' text is unchanged, so this is N, not I.",
 "N6": "operation.contact.log is edited (one new effect), but the conflicting text ('Recompute affected goals') is pre-existing. The primary counterpart, S.webapp.qualification, is 1 hop away and unchanged.",
 "N2": "The conflicting rule appears in several places: operation.data.export (1 hop), J.control.export/e1 (1 hop), screen.settings and C.webapp.lifecycle.data.",
}
INTERNAL_NOTE = "Class I counterparts are edits of the same change, so they are in C by construction (hops 0)."

man = {}; rows = []
for v in V:
    vid = ids[v["key"]]; a = an[vid]; l = lint[vid]
    e = {"class": v["cls"] if v["cls"] != "control" else "control", "feature": v["feature"],
         "edits": [{"file": x["file"], "description": x["description"]} for x in v["edits"]],
         "stats": {"changedNodes": a["changedCount"], "sliceSize": a["sliceSize"], "nodes": a["nodes"], "links": a["links"]},
         "newLinterFinding": {"value": bool(l["new"]), "rules": sorted({f"{f['level']}:{f['rule']}:{f['subject']}" for f in l["new"]}),
                              "removed": sorted({f"{f['rule']}:{f['subject']}" for f in l["removed"]}),
                              "pointsAtSeededDefect": False}}
    if v["cls"] != "control":
        cps = a["counterparts"]
        hb = [c["hopsBlocked"] for c in cps if c["hopsBlocked"] is not None]
        hr = [c["hopsRaw"] for c in cps if c["hopsRaw"] is not None]
        e.update({"defect": v["defect"], "changedSide": v["changedSide"], "counterpart": v["counterpart"],
                  "minLinkHops": min(hb) if hb else None, "minLinkHopsRaw": min(hr) if hr else None,
                  "inSlice": any(c["inSlice"] for c in cps),
                  "counterpartDetail": [{k: c[k] for k in ("id", "inSlice", "hopsBlocked", "hopsRaw", "family", "path")} for c in cps],
                  "mechanism": v["mechanism"]})
        if v["key"] in BORDER: e["borderline"] = BORDER[v["key"]]
        if v["cls"] == "I": e["note"] = INTERNAL_NOTE
    else:
        e["suspicious"] = v["suspicious"]
    man[vid] = e
    rows.append((v["cls"], v["key"], vid, len(v["edits"]), len({x["file"] for x in v["edits"]}), a["changedCount"], a["sliceSize"],
                 e.get("minLinkHops"), e.get("minLinkHopsRaw"), e.get("inSlice"), ",".join(r.split(":")[1] for r in e["newLinterFinding"]["rules"]) or "-"))

assert sorted(man) == sorted(public)
json.dump({k: man[k] for k in public}, open(os.path.join(HB, "manifest.json"), "w"), indent=1)

order = {"I": 0, "N": 1, "F": 2, "U": 3, "control": 4}
rows.sort(key=lambda r: (order[r[0]], r[1]))
counts = {}
for r in rows: counts[r[0]] = counts.get(r[0], 0) + 1
t = ["| Class | Count |", "|---|---|"] + [f"| {k} | {counts.get(k, 0)} |" for k in ("I", "N", "F", "U", "control")] + [f"| total | {len(rows)} |", ""]
t += ["| Class | Set | Id | Edits | Files | Changed nodes | Slice size | Min hops (blocked) | Min hops (raw) | Counterpart in slice | New linter rules |",
      "|---|---|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    t.append("| " + " | ".join("-" if x is None else ("yes" if x is True else "no" if x is False else str(x)) for x in r) + " |")
import statistics as st
t.append("")
t += ["| Class | Changed nodes, median (range) | Slice size, median (range) |", "|---|---|---|"]
for c in ("I", "N", "F", "U", "control"):
    cs = [r[5] for r in rows if r[0] == c]; ss = [r[6] for r in rows if r[0] == c]
    t.append(f"| {c} | {st.median(cs)} ({min(cs)}-{max(cs)}) | {st.median(ss)} ({min(ss)}-{max(ss)}) |")
table = "\n".join(t)
rp = os.path.join(HB, "README.md")
if os.path.exists(rp):
    txt = open(rp).read(); a0 = txt.index("<!-- STATS -->"); a1 = txt.index("<!-- /STATS -->")
    open(rp, "w").write(txt[:a0] + "<!-- STATS -->\n" + table + "\n" + txt[a1:])
print(table)
