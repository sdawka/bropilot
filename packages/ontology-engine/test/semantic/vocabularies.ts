import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  artyfactGenome, loadArtyfactSystem, loadTemplate, memoryStore, productGraphToGraph, productSpec, withSemanticProbes,
  worldBase, worldSnapshotToGraph, worldTemplateSource, type Graph, type Readiness, type Template,
} from "../../src";
import { readDir } from "../../src/adapters/artyfact/node";
import type { WorldSnapshot } from "@bropilot/contracts";
import { templateFiles } from "../artyfact-reference";

export const FIXTURES = join(__dirname, "../fixtures/semantic");

export interface Planted { id: string; rule: string; subjects: string[]; level: "warning" | "error"; note: string }
export interface Control { id: string; subject: string; note: string }
export interface Expectations { fixture: string; vocabulary: string; planted: Planted[]; controls: Control[] }

export interface Vocabulary { name: string; template: Template; graph: Graph; expectations: Expectations }

const json = (file: string) => JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));

/** Probe settings per vocabulary: which fields are statements, which kinds are measured, and how pairs are formed. */
export const SETTINGS = {
  artyfact: {
    texts: ["description", "statement", "text", "claim", "summary", "outcome", "intent"],
    measurable: ["claim", "criterion"],
    criteria: ["criterion"],
    probePairs: ["governs"],
    siblings: ["component"],
    fields: ["name", "title", "description", "statement", "text", "claim", "summary", "outcome", "intent"],
  },
  product: {
    texts: ["description"],
    measurable: ["outcome", "goal", "hypothesis"],
    criteria: ["rule", "test"],
    probePairs: [],
    siblings: ["purpose", "summary", "rule"],
    fields: ["title", "description"],
  },
  world: {
    texts: ["description"],
    measurable: ["outcome", "indicator", "acceptanceCriterion"],
    criteria: ["acceptanceCriterion"],
    probePairs: ["authorizedBy"],
    siblings: [],
    fields: ["ws.title", "description"],
  },
};

export function artyfactVocabulary(): Vocabulary {
  const template = loadTemplate(withSemanticProbes(artyfactGenome, SETTINGS.artyfact));
  const graph = loadArtyfactSystem(readDir(join(FIXTURES, "keep-in-touch-degraded")), { templates: templateFiles() }) as Graph;
  return { name: "artyfact", template, graph, expectations: json("keep-in-touch.expectations.json") };
}

export function productVocabulary(): Vocabulary {
  const template = loadTemplate(withSemanticProbes(productSpec, SETTINGS.product));
  const graph = productGraphToGraph(json("tidepool-degraded.graph.json"));
  return { name: "product", template, graph, expectations: json("tidepool.expectations.json") };
}

export function worldVocabulary(): Vocabulary {
  const snapshot = json("assistant-degraded.json") as WorldSnapshot;
  const template = loadTemplate(withSemanticProbes(worldTemplateSource(snapshot), SETTINGS.world), memoryStore([worldBase]));
  const graph = worldSnapshotToGraph(snapshot, template);
  return { name: "world", template, graph, expectations: json("assistant.expectations.json") };
}

export const VOCABULARIES = [artyfactVocabulary, productVocabulary, worldVocabulary];

export const PROBE_RULES = ["text.vague", "text.unmeasurable", "pair.contradiction", "criterion.unfalsifiable"];
export const subjectOf = (p: Planted): string => p.subjects.join("|");
export const probeFindings = (r: Readiness) => r.findings.filter((f) => PROBE_RULES.some((rule) => f.rule === `semantic:${rule}`));
/** Subjects a finding names: one node, or both ends of a pair. */
export const subjectsOf = (subject: string | undefined): string[] => (subject ?? "").split("|");
