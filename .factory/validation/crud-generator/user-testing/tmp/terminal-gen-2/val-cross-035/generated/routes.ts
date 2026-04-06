// Generated Hono route handlers
// Do not edit manually

import { Hono } from 'hono';
import type { Context } from 'hono';

const app = new Hono();

// List tasks
app.get('/api/tasks', async (c: Context) => {
  // TODO: Implement GET /api/tasks
  return c.json({ ok: true, data: {} });
});

// Create task
app.post('/api/tasks', async (c: Context) => {
  // TODO: Implement POST /api/tasks
  return c.json({ ok: true, data: {} });
});

export default app;
