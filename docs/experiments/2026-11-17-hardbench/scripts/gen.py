# Builds variants/<id>/ and diffs/<id>.diff from variants_def.py. Run: python3 -I gen.py
import json, os, re, secrets, random, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from variants_def import V  # noqa: E402

HB = os.path.dirname(HERE)
CLEAN = os.path.join(os.path.dirname(HB), "killtest", "clean")
VAR = os.path.join(HB, "variants"); DIFFS = os.path.join(HB, "diffs"); WORK = os.path.join(HB, "work")
IDS = os.path.join(WORK, "ids.json")

ids = json.load(open(IDS)) if os.path.exists(IDS) else {}
used = set(ids.values())
for v in V:
    if v["key"] not in ids:
        while True:
            h = secrets.token_hex(3)
            if h not in used: break
        ids[v["key"]] = h; used.add(h)
json.dump(ids, open(IDS, "w"), indent=1)

shutil.rmtree(VAR, ignore_errors=True); shutil.rmtree(DIFFS, ignore_errors=True)
os.makedirs(VAR); os.makedirs(DIFFS)
errors = []
meta = {}
for v in V:
    vid = ids[v["key"]]; dst = os.path.join(VAR, vid)
    shutil.copytree(CLEAN, dst)
    files = set()
    for e in v["edits"]:
        p = os.path.join(dst, e["file"]); files.add(e["file"])
        if "create" in e:
            if os.path.exists(p): errors.append(f"{v['key']}: create exists {e['file']}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "w").write(e["create"]); continue
        t = open(p).read(); n = t.count(e["old"])
        if n != 1: errors.append(f"{v['key']}: {e['file']} count={n} :: {e['old'][:70]!r}")
        else: open(p, "w").write(t.replace(e["old"], e["new"]))
    if len(v["edits"]) < 4 or len(v["edits"]) > 9 or len(files) < 3:
        errors.append(f"{v['key']}: edits={len(v['edits'])} files={len(files)}")
    r = subprocess.run(["diff", "-ruN", CLEAN, dst], capture_output=True, text=True)
    d = r.stdout
    d = re.sub(r"^diff -ruN .*\n", "", d, flags=re.M)
    d = d.replace(CLEAN + "/", "a/").replace(dst + "/", "b/")
    d = re.sub(r"^(---|\+\+\+) ([ab]/\S+)\t.*$", r"\1 \2", d, flags=re.M)
    open(os.path.join(DIFFS, vid + ".diff"), "w").write(d)
    meta[vid] = {"key": v["key"], "cls": v["cls"], "files": sorted(files),
                 "changedSide": v.get("changedSide", []), "counterpart": v.get("counterpart", [])}

order = list(ids[v["key"]] for v in V)
PUB = os.path.join(HB, "public.json")
prev = json.load(open(PUB)) if os.path.exists(PUB) else []
if sorted(prev) == sorted(order): order = prev  # keep the existing shuffle stable across regenerations
else: random.SystemRandom().shuffle(order)
json.dump(order, open(os.path.join(HB, "public.json"), "w"), indent=1)
json.dump(meta, open(os.path.join(WORK, "meta.json"), "w"), indent=1)
print("\n".join(errors) if errors else f"ok {len(V)} variants")
