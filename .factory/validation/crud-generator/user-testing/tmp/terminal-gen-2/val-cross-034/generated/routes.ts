// Generated Hono route handlers
// Do not edit manually

import { Hono } from 'hono';
import type { Context } from 'hono';

const app = new Hono();

// List settings
app.get('/api/settings', async (c: Context) => {
  // TODO: Implement GET /api/settings
  return c.json({ ok: true, data: {} });
});

// Create setting
app.post('/api/settings', async (c: Context) => {
  // TODO: Implement POST /api/settings
  return c.json({ ok: true, data: {} });
});

export default app;
