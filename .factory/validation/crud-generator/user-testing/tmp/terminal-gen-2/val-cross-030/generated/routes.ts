// Generated Hono route handlers
// Do not edit manually

import { Hono } from 'hono';
import type { Context } from 'hono';

const app = new Hono();

// List all tasks in a workspace
app.get('/api/tasks', async (c: Context) => {
  // TODO: Implement GET /api/tasks
  return c.json({ ok: true, data: {} });
});

// Create a new task
app.post('/api/tasks', async (c: Context) => {
  // TODO: Implement POST /api/tasks
  return c.json({ ok: true, data: {} });
});

// Update an existing task
app.put('/api/tasks/:id', async (c: Context) => {
  // TODO: Implement PUT /api/tasks/:id
  return c.json({ ok: true, data: {} });
});

// Delete a task
app.delete('/api/tasks/:id', async (c: Context) => {
  // TODO: Implement DELETE /api/tasks/:id
  return c.json({ ok: true, data: {} });
});

// List workspace members
app.get('/api/users', async (c: Context) => {
  // TODO: Implement GET /api/users
  return c.json({ ok: true, data: {} });
});

export default app;
