/// <reference types="node" />
// Probe slice membership and hops for arbitrary nodes in one variant: node probe.ts <key> <nodeId>...
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load, changedNodes, slice, hops, familyOf } from "./lib.ts";
const HB = dirname(dirname(fileURLToPath(import.meta.url)));
const [key, ...xs] = process.argv.slice(2);
const ids = JSON.parse(readFileSync(join(HB, "work", "ids.json"), "utf8"));
const vid = ids[key];
const clean = load(join(dirname(HB), "killtest", "clean")), v = load(join(HB, "variants", vid));
const { delta, C } = changedNodes(clean, v, readFileSync(join(HB, "diffs", vid + ".diff"), "utf8"));
const rm = delta.links.removed as { from: string; rel: string; to: string }[];
const S = slice(clean, v, C, rm), hb = hops(clean, v, C, rm, true), hr = hops(clean, v, C, rm, false);
console.log(key, vid, "C:", [...C].join(", "));
for (const x of xs) console.log(" ", x, S.has(x) ? "IN" : "out", "b" + (hb.get(x) ?? "-"), "r" + (hr.get(x) ?? "-"), familyOf(clean, v, C, x) ?? "");
