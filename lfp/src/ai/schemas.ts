// Output schemas: one Valibot schema per registry id, mirroring each ai/functions/*.ts `*Out`
// type exactly, so `ai/backend.ts`'s BusBackend can validate a real model's JSON the same way the
// server will (AGENT-RUNTIME.md §7). Node-runnable: only `valibot` and `.ts` imports.
import * as v from 'valibot';

const StatusSchema = v.picklist(['draft', 'committed']);
const ViewSchema = v.picklist(['overview', 'definition', 'domain', 'flows', 'kernel']);

const NodeSchema = v.object({
  id: v.string(),
  kind: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  props: v.optional(v.record(v.string(), v.string())),
  status: StatusSchema,
  answerId: v.optional(v.string()),
});

const EdgeSchema = v.object({
  id: v.string(),
  src: v.string(),
  dst: v.string(),
  type: v.string(),
  status: v.optional(StatusSchema),
  answerId: v.optional(v.string()),
  trace: v.optional(v.picklist(['valid', 'suspect'])),
});

const EffectSchema = v.union([
  v.object({ id: v.string(), op: v.literal('add-node'), node: NodeSchema, answerId: v.string() }),
  v.object({ id: v.string(), op: v.literal('update-node'), nodeId: v.string(), patch: v.partial(NodeSchema), answerId: v.string() }),
  v.object({ id: v.string(), op: v.literal('remove-node'), nodeId: v.string(), answerId: v.string() }),
  v.object({ id: v.string(), op: v.literal('add-edge'), edge: EdgeSchema, answerId: v.string() }),
]);

const OpenItemSchema = v.object({
  id: v.string(),
  prompt: v.string(),
  produces: v.string(),
  source: v.picklist(['template', 'violation', 'agent', 'contradiction']),
  subjects: v.array(v.string()),
  tier: v.picklist([1, 2, 3, 4]),
  options: v.optional(v.array(v.string())),
  blocking: v.optional(v.string()),
});

// ── describe-screen ──────────────────────────────────────────────────────────
const DescribeScreenHit = v.object({
  op: v.literal('hit'),
  id: v.string(), label: v.string(), title: v.string(), description: v.optional(v.string()),
  quote: v.string(), related: v.string(), view: ViewSchema, level: v.optional(v.picklist([0, 1, 2, 3])),
  pointIds: v.array(v.string()), edgeIds: v.array(v.string()), suspect: v.string(),
});
const DescribeScreenNotFound = v.object({ op: v.literal('not-found'), text: v.string(), suspect: v.string() });
const DescribeScreenScreen = v.object({ op: v.literal('screen'), view: v.string(), itemIds: v.array(v.string()), summary: v.string(), suspect: v.string() });
const DescribeScreenSchema = v.variant('op', [DescribeScreenHit, DescribeScreenNotFound, DescribeScreenScreen]);

// ── next-decision ────────────────────────────────────────────────────────────
const NextDecisionSchema = v.object({ item: v.nullable(OpenItemSchema), openCount: v.number() });

// ── answer-to-effects ────────────────────────────────────────────────────────
const AnswerToEffectsSchema = v.object({ effects: v.array(EffectSchema), warnings: v.array(v.string()) });

// ── propose-followup ─────────────────────────────────────────────────────────
const ProposeFollowupSchema = v.object({ parentId: v.string(), label: v.string(), prompt: v.string() });

// ── explain-node ─────────────────────────────────────────────────────────────
const GroupSchema = v.object({ label: v.string(), nodeIds: v.array(v.string()), edgeIds: v.array(v.string()) });
const ExplainNodeExplain = v.object({
  op: v.literal('explain'), nodeId: v.string(), label: v.string(), title: v.string(),
  description: v.optional(v.string()), quote: v.string(), verdict: v.optional(v.string()), groups: v.array(GroupSchema),
});
const ExplainNodeExplainNone = v.object({ op: v.literal('explain-none') });
const ExplainNodeRewordAsk = v.object({ op: v.literal('reword-ask'), nodeId: v.string(), title: v.string() });
const ExplainNodeRewordNone = v.object({ op: v.literal('reword-none') });
const ExplainNodeRewordStaged = v.object({ op: v.literal('reword-staged'), nodeId: v.string(), title: v.string(), newTitle: v.string() });
const ExplainNodeSchema = v.variant('op', [ExplainNodeExplain, ExplainNodeExplainNone, ExplainNodeRewordAsk, ExplainNodeRewordNone, ExplainNodeRewordStaged]);

// ── walk-map ──────────────────────────────────────────────────────────────────
const WalkMapStep = v.object({
  text: v.string(),
  view: v.optional(v.picklist(['domain', 'overview'])),
  level: v.optional(v.literal(0)),
  clear: v.optional(v.boolean()),
  nodes: v.optional(v.array(v.string())),
  edges: v.optional(v.array(v.string())),
  focus: v.optional(v.string()),
});
const WalkMapSchema = v.object({ steps: v.array(WalkMapStep) });

// ── find-gaps ─────────────────────────────────────────────────────────────────
const FindGapsSchema = v.object({ gaps: v.array(v.string()), pointIds: v.array(v.string()) });

// ── unrealised-to-tasks ────────────────────────────────────────────────────────
const UnrealisedNone = v.object({ op: v.literal('none'), moduleId: v.string() });
const TaskSchema = v.object({ id: v.string(), title: v.string() });
const UnrealisedPlan = v.object({
  op: v.literal('plan'), moduleId: v.string(), missingIds: v.array(v.string()), missingTitles: v.array(v.string()),
  epic: v.object({ id: v.string(), title: v.string() }), tasks: v.array(TaskSchema),
});
const UnrealisedToTasksSchema = v.variant('op', [UnrealisedNone, UnrealisedPlan]);

// ── define-term ───────────────────────────────────────────────────────────────
const DefineTermAskTitle = v.object({ op: v.literal('ask-title') });
const DefineTermAskDesc = v.object({ op: v.literal('ask-desc'), title: v.string() });
const DefineTermDone = v.object({ op: v.literal('done'), title: v.string(), description: v.string(), existingId: v.optional(v.string()) });
const DefineTermSchema = v.variant('op', [DefineTermAskTitle, DefineTermAskDesc, DefineTermDone]);

// ── review-change ─────────────────────────────────────────────────────────────
const ReviewChangeSchema = v.object({
  verdict: v.picklist(['serves-intent', 'overfits', 'unclear']),
  reasons: v.array(v.string()), taskId: v.string(), taskTitle: v.string(),
  testIds: v.array(v.string()), ruleIds: v.array(v.string()),
});

// ── raise-question ───────────────────────────────────────────────────────────
const RaiseQuestionSchema = v.object({
  prompt: v.string(), subjects: v.array(v.string()), produces: v.string(),
  taskId: v.optional(v.string()), taskTitle: v.string(),
});

// ── consolidate-questions ──────────────────────────────────────────────────────
const ConsolidateQuestionsSchema = v.object({
  prompt: v.string(), options: v.array(v.string()), answersAll: v.boolean(),
  followupId: v.optional(v.string()), count: v.optional(v.number()),
});

// ── find-contradictions ────────────────────────────────────────────────────────
const ContradictionSchema = v.object({ subjects: v.array(v.string()), prompt: v.string(), produces: v.string() });
const FindContradictionsSchema = v.object({ contradictions: v.array(ContradictionSchema) });

export const OUTPUT_SCHEMAS: Record<string, v.GenericSchema> = {
  'describe-screen': DescribeScreenSchema,
  'next-decision': NextDecisionSchema,
  'answer-to-effects': AnswerToEffectsSchema,
  'propose-followup': ProposeFollowupSchema,
  'explain-node': ExplainNodeSchema,
  'walk-map': WalkMapSchema,
  'find-gaps': FindGapsSchema,
  'unrealised-to-tasks': UnrealisedToTasksSchema,
  'define-term': DefineTermSchema,
  'review-change': ReviewChangeSchema,
  'raise-question': RaiseQuestionSchema,
  'consolidate-questions': ConsolidateQuestionsSchema,
  'find-contradictions': FindContradictionsSchema,
};

export function schemaFor(id: string): v.GenericSchema {
  const schema = OUTPUT_SCHEMAS[id];
  if (!schema) throw new Error(`ai/schemas: no output schema for "${id}"`);
  return schema;
}
