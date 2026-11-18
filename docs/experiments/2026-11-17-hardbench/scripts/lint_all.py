# Runs the deterministic linter on clean and every variant; records new/removed findings by (level, rule, subject).
# Run: python3 -I lint_all.py   (writes work/lint/<id>.json and work/lint_delta.json)
import json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); HB = os.path.dirname(HERE)
CLEAN = os.path.join(os.path.dirname(HB), "killtest", "clean")
PKG = "/Users/sdawka/Code/bropilot/packages/ontology-engine"
TPL = "/Users/sdawka/Code/artyfact-cf/packages/templates"
OUT = os.path.join(HB, "work", "lint"); os.makedirs(OUT, exist_ok=True)

def lint(d, name):
    r = subprocess.run(["npm", "run", "-s", "lint:system", "--", d, "--templates", TPL, "--json"], cwd=PKG, capture_output=True, text=True)
    open(os.path.join(OUT, name + ".json"), "w").write(r.stdout)
    j = json.loads(r.stdout)
    return {(f["level"], f["rule"], f["subject"]) for f in j["findings"]}, {f"{f['level']}|{f['rule']}|{f['subject']}": f["message"] for f in j["findings"]}

base, _ = lint(CLEAN, "clean")
meta = json.load(open(os.path.join(HB, "work", "meta.json")))
res = {"clean": {"count": len(base), "byLevel": {}}}
for k in base: res["clean"]["byLevel"][k[0]] = res["clean"]["byLevel"].get(k[0], 0) + 1
for vid, m in sorted(meta.items(), key=lambda x: x[1]["key"]):
    s, msg = lint(os.path.join(HB, "variants", vid), vid)
    new = sorted(s - base); gone = sorted(base - s)
    res[vid] = {"key": m["key"], "count": len(s), "new": [{"level": a, "rule": b, "subject": c, "message": msg[f"{a}|{b}|{c}"]} for a, b, c in new],
                "removed": [{"level": a, "rule": b, "subject": c} for a, b, c in gone]}
    print(m["key"], vid, len(s), "NEW:", [f"{a}:{b}:{c}" for a, b, c in new], "GONE:", [f"{b}:{c}" for a, b, c in gone])
json.dump(res, open(os.path.join(HB, "work", "lint_delta.json"), "w"), indent=1)
