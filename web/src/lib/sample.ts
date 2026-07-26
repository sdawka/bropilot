import type { Graph } from './schema';
import data from './sample-data.json' with { type: 'json' };

// The dogfooded sample: Bropilot Studio modelling itself, extracted from this
// repo. Canonical { nodes, edges } Bropilot JSON in sample-data.json; this
// wrapper just types it. Seeded on first run; wiped on import/reset.
export const SAMPLE_GRAPH: Graph = data as Graph;
