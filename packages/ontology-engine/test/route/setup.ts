import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorldSnapshot } from "@bropilot/contracts";
import {
  loadTemplate, PRODUCT_KIND_LABELS, PRODUCT_SPACE_LABELS, PRODUCT_SPACES, productGraphToGraph, productSpec, worldSnapshotToGraph,
  worldTemplateToMeta, type Graph, type RouteCaseFile, type RouteOptions, type RouteVocabularySource,
} from "../../src";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
export const ROUTE_FIXTURES = join(__dirname, "../fixtures/route");

export interface RouteSetting { name: string; graph: Graph; template: RouteVocabularySource; options: RouteOptions; cases: RouteCaseFile }

/** The tidepool product graph routed by the lfp kernel's kind -> space map. */
export function tidepool(): RouteSetting {
  return {
    name: "tidepool",
    graph: productGraphToGraph(json(join(__dirname, "../fixtures/product/tidepool.graph.json"))),
    template: loadTemplate(productSpec),
    options: { spaces: PRODUCT_SPACES, spaceLabels: PRODUCT_SPACE_LABELS, kindLabels: PRODUCT_KIND_LABELS },
    cases: json(join(ROUTE_FIXTURES, "tidepool.cases.json")),
  };
}

/** The assistant world snapshot routed by its sections (children of `assistant-world`). */
export function assistant(): RouteSetting {
  const snapshot: WorldSnapshot = json(join(__dirname, "../../../contracts/fixtures/assistant-valid.json"));
  const template = worldTemplateToMeta(snapshot);
  return { name: "assistant", graph: worldSnapshotToGraph(snapshot, template), template, options: {}, cases: json(join(ROUTE_FIXTURES, "assistant.cases.json")) };
}

/**
 * Gold cases whose `space` disagrees with the lfp kernel's kind -> space map; the kernel map wins and the gold needs
 * fixing. t05: goal sits in `problem` in lfp `src/kernel.ts`, the gold says `hypothesis`.
 */
export const GOLD_SPACE_MISMATCHES: Record<string, string[]> = { tidepool: [], assistant: [] };
