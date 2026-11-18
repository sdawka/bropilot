#!/usr/bin/env python3
"""Hard benchmark runner. Subcommands: prep | run [--limit N] [--cells A1,..] [--jobs 4] | status | bundle"""
import json, os, re, subprocess, sys, time, random, argparse, secrets
from concurrent.futures import ThreadPoolExecutor, as_completed

R = os.path.dirname(os.path.abspath(__file__))
H = os.path.join(os.path.dirname(R), "hardbench")
PKG = "/Users/sdawka/Code/bropilot/packages/ontology-engine"
BASE = os.path.join(os.path.dirname(R), "killtest", "clean")
TPL = "/Users/sdawka/Code/artyfact-cf/packages/templates"
IDS = json.load(open(os.path.join(H, "public.json")))
CELLS = {  # cell -> (mode, reply)
    "A1": ("diff", None), "A2": ("slice", None), "A3": ("whole", None),
    "B2": ("slice", "experiment"), "A1r": ("diff", None), "A2r": ("slice", None),
}
ORDER = ["A1", "A2", "A3", "B2", "A1r", "A2r"]
MAX_COST = 60.0


def cmd(vid, mode, reply=None, prompt=False):
    c = ["npm", "run", "-s", "review:change", "--", "--base", BASE, "--head", os.path.join(H, "variants", vid),
         "--templates", TPL, "--json", "--mode", mode]
    if reply: c += ["--reply", reply]
    if prompt: c += ["--print-prompt"]
    return c


def prep():
    os.makedirs(os.path.join(R, "prompts"), exist_ok=True)
    stats, leaks = {}, []
    needles = ["hardbench", "killtest", "variants", "scratchpad", "claude-501", "/private/tmp", H]
    jobs = [(v, m, rp) for v in IDS for (m, rp) in [("diff", None), ("slice", None), ("whole", None), ("slice", "experiment")]]

    def one(j):
        v, m, rp = j
        p = subprocess.run(cmd(v, m, rp, True), cwd=PKG, capture_output=True, text=True)
        return j, p

    with ThreadPoolExecutor(6) as ex:
        for f in as_completed([ex.submit(one, j) for j in jobs]):
            (v, m, rp), p = f.result()
            key = m + ("-exp" if rp else "")
            if p.returncode != 0:
                print("PREP ERROR", v, key, p.stderr[:500]); continue
            prompt = p.stdout
            open(os.path.join(R, "prompts", f"{v}.{key}.txt"), "w").write(prompt)
            mm = re.search(r"changed (\d+)( \(from diff text\))?, slice (\d+) of (\d+) nodes, prompt (\d+) chars \(~(\d+) tokens\)", p.stderr)
            st = {"changed": int(mm[1]), "fallback": bool(mm[2]), "slice": int(mm[3]), "total": int(mm[4]),
                  "promptChars": int(mm[5]), "approxTokens": int(mm[6])} if mm else {"raw": p.stderr.strip()}
            stats.setdefault(v, {})[key] = st
            for n in needles + IDS:
                for mt in re.finditer(re.escape(n), prompt):
                    leaks.append({"variant": v, "mode": key, "needle": n,
                                  "context": prompt[max(0, mt.start() - 60): mt.end() + 60]})
    json.dump(stats, open(os.path.join(R, "prep_stats.json"), "w"), indent=1, sort_keys=True)
    json.dump(leaks, open(os.path.join(R, "leaks.json"), "w"), indent=1)
    print(f"prep done: {sum(len(x) for x in stats.values())} prompts, {len(leaks)} needle hits")


def out_path(cell, vid):
    return os.path.join(R, "raw", cell, f"{vid}.json")


def total_cost():
    t = 0.0
    for cell in ORDER:
        d = os.path.join(R, "raw", cell)
        if not os.path.isdir(d): continue
        for f in os.listdir(d):
            t += json.load(open(os.path.join(d, f))).get("cost") or 0.0
    for f in ([os.path.join(R, "retries.jsonl")] if os.path.exists(os.path.join(R, "retries.jsonl")) else []):
        for line in open(f):
            t += json.loads(line).get("cost") or 0.0
    return t


ABORT = []


def call(cell, vid):
    if ABORT: return {"cell": cell, "variant": vid, "aborted": True}
    mode, reply = CELLS[cell]
    attempts = []
    for attempt in range(1, 4):
        t0 = time.time()
        p = subprocess.run(cmd(vid, mode, reply), cwd=PKG, capture_output=True, text=True)
        wall = time.time() - t0
        parsed = None
        if p.returncode in (0, 1):
            try: parsed = json.loads(p.stdout)
            except Exception: parsed = None
        ok = parsed is not None and "verdict" in parsed
        rec = {"cell": cell, "variant": vid, "attempt": attempt, "exit": p.returncode, "wall": round(wall, 1),
               "ok": ok, "stderr": p.stderr[-3000:]}
        if ok:
            res = {"cell": cell, "variant": vid, "exit": p.returncode, "wall": round(wall, 1),
                   "cost": parsed.get("costUsd"), "attempts": attempt, "failed_attempts": attempts, "cli": parsed}
            os.makedirs(os.path.dirname(out_path(cell, vid)), exist_ok=True)
            json.dump(res, open(out_path(cell, vid), "w"), indent=1)
            return res
        rec["stdout"] = p.stdout[-3000:]
        if '"duration_api_ms":0' in p.stderr and '"total_cost_usd":0' in p.stderr:
            ABORT.append(1)
            with open(os.path.join(R, "retries.jsonl"), "a") as fh:
                fh.write(json.dumps({**rec, "usage_limit": True}) + "\n")
            print(f"  USAGE LIMIT {cell} {vid}; aborting batch", flush=True)
            return {"cell": cell, "variant": vid, "aborted": True}
        attempts.append(rec)
        with open(os.path.join(R, "retries.jsonl"), "a") as fh:
            fh.write(json.dumps(rec) + "\n")
        print(f"  RETRY {cell} {vid} attempt {attempt} exit {p.returncode}: {p.stderr.strip()[:200]}", flush=True)
    res = {"cell": cell, "variant": vid, "failed": True, "attempts": 3, "failed_attempts": attempts}
    os.makedirs(os.path.join(R, "failed"), exist_ok=True)
    json.dump(res, open(os.path.join(R, "failed", f"{cell}.{vid}.json"), "w"), indent=1)
    return res


def run(limit, cells, jobs):
    todo = [(c, v) for c in cells for v in IDS if not os.path.exists(out_path(c, v))
            and not os.path.exists(os.path.join(R, "failed", f"{c}.{v}.json"))]
    spent = total_cost()
    print(f"pending {len(todo)}, spent so far ${spent:.2f}", flush=True)
    if spent > MAX_COST:
        print("COST CAP EXCEEDED; stopping"); return
    todo = todo[:limit]
    t0 = time.time()
    with ThreadPoolExecutor(jobs) as ex:
        futs = {ex.submit(call, c, v): (c, v) for c, v in todo}
        for f in as_completed(futs):
            r = f.result()
            if r.get("aborted"): continue
            if r.get("failed"): print(f"FAILED {r['cell']} {r['variant']}", flush=True)
            else: print(f"ok {r['cell']} {r['variant']} {r['cli']['verdict']} n={len(r['cli']['findings'])} ${r['cost']:.3f} {r['wall']}s", flush=True)
    print(f"batch {len(todo)} in {time.time() - t0:.0f}s; spent ${total_cost():.2f}", flush=True)


def status():
    for c in ORDER:
        d = os.path.join(R, "raw", c)
        n = len(os.listdir(d)) if os.path.isdir(d) else 0
        print(c, n)
    print(f"spent ${total_cost():.2f}")


def bundle():
    ps = json.load(open(os.path.join(R, "prep_stats.json")))
    rng = random.SystemRandom()
    blind, key, stats, used = [], {}, {}, set()
    os.makedirs(os.path.join(R, "blind", "outputs"), exist_ok=True)
    os.makedirs(os.path.join(R, "key"), exist_ok=True)
    for c in ORDER:
        mode, reply = CELLS[c]
        pkey = mode + ("-exp" if reply else "")
        stats[c] = {}
        for v in IDS:
            fp = out_path(c, v)
            if not os.path.exists(fp):
                stats[c][v] = {"failed": True}; continue
            r = json.load(open(fp)); cli = r["cli"]
            while True:
                oid = secrets.token_hex(4)
                if oid not in used: used.add(oid); break
            out = {"variant": v, "verdict": cli["verdict"],
                   "findings": [{"nodeIds": f.get("nodeIds", []), "severity": f.get("severity"), "summary": f.get("summary"),
                                 "evidence": f.get("evidence", "")} for f in cli.get("findings", [])],
                   "unknownIds": cli.get("unknownIds", [])}
            json.dump(out, open(os.path.join(R, "blind", "outputs", f"{oid}.json"), "w"), indent=1)
            blind.append({"outid": oid, "variant": v}); key[oid] = c
            stats[c][v] = {"outid": oid, "cost": r["cost"], "wall": r["wall"], "exit": r["exit"], "attempts": r["attempts"],
                           "retries": r["attempts"] - 1, "retry_errors": [a["stderr"][-300:] for a in r["failed_attempts"]],
                           "prompt": ps[v][pkey], "cli_stats": cli.get("stats"), "deterministic": cli.get("deterministic", []),
                           "verdict": cli["verdict"], "n_findings": len(cli.get("findings", [])),
                           "unknownIds": cli.get("unknownIds", [])}
    rng.shuffle(blind)
    json.dump(blind, open(os.path.join(R, "blind", "index.json"), "w"), indent=1)
    json.dump(key, open(os.path.join(R, "key", "outid_to_cell.json"), "w"), indent=1, sort_keys=True)
    json.dump({"notes": [
        "Findings in blind outputs are in the CLI's order: runReview stable-sorts by severity (high, medium, low), so the model's own order is preserved only within each severity; --json does not include the raw reply.",
        "Usage-limit failures (claude 5-hour limit, cost $0, api time 0) were not counted as retries; they are logged in retries.jsonl with usage_limit or as the 52 early records parked in failed_ratelimit/.",
        "prompt = --print-prompt stats for the call's mode; cli_stats = stats from the run itself; deterministic = new-in-head lint findings from the CLI."],
        "cells": stats}, open(os.path.join(R, "stats.json"), "w"), indent=1)
    # summary
    summ = {}
    for c in ORDER:
        rows = [x for x in stats[c].values() if not x.get("failed")]
        n = len(rows)
        summ[c] = {"ok": n, "failed": 36 - n,
                   "total_cost": round(sum(x["cost"] or 0 for x in rows), 3),
                   "mean_cost": round(sum(x["cost"] or 0 for x in rows) / max(n, 1), 4),
                   "mean_wall": round(sum(x["wall"] for x in rows) / max(n, 1), 1),
                   "mean_prompt_tokens": round(sum(x["prompt"]["approxTokens"] for x in rows) / max(n, 1)),
                   "defect": sum(x["verdict"] == "defect" for x in rows), "clean": sum(x["verdict"] == "clean" for x in rows),
                   "mean_findings": round(sum(x["n_findings"] for x in rows) / max(n, 1), 2),
                   "retries": sum(x["retries"] for x in rows),
                   "outputs_with_unknown_ids": sum(bool(x["unknownIds"]) for x in rows),
                   "unknown_ids_total": sum(len(x["unknownIds"]) for x in rows)}
    json.dump(summ, open(os.path.join(R, "summary.json"), "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("sub")
    ap.add_argument("--limit", type=int, default=24)
    ap.add_argument("--cells", default=",".join(ORDER))
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    if a.sub == "prep": prep()
    elif a.sub == "run": run(a.limit, a.cells.split(","), a.jobs)
    elif a.sub == "status": status()
    elif a.sub == "bundle": bundle()
