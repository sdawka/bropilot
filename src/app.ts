import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './genome/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));

// Direct API for loading bootstrap demo graph
app.post('/api/load-bootstrap', async (c) => {
  try {
    store.initSchema();

    const fixturePath = resolve(__dirname, '../fixtures/bropilot-bootstrap.json');
    const data = readFileSync(fixturePath, 'utf-8');
    const bootstrapData = JSON.parse(data) as store.BootstrapGraph;

    const result = store.loadBootstrapGraph(bootstrapData);

    if (result.success) {
      // Return the loaded graph for immediate UI update
      const graph = store.getGraph();
      return c.json({
        success: true,
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
        graph,
      });
    } else {
      return c.json({ success: false, error: result.error }, 500);
    }
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Direct API to get current graph state (without going through agent)
app.get('/api/graph', async (c) => {
  try {
    store.initSchema();
    const graph = store.getGraph();
    return c.json(graph);
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

app.route('/', flue());

export default app;
