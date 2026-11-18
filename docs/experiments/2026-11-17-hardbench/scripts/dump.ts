/// <reference types="node" />
// Dumps a loaded graph as JSON (exploration aid): node <dir> <out.json>
import { writeFileSync } from "node:fs";
import { load } from "./lib.ts";
const [dir, out] = process.argv.slice(2);
const g = load(dir);
writeFileSync(out, JSON.stringify(g, null, 1));
console.log(`nodes ${g.nodes.length} links ${g.links.length}`);
