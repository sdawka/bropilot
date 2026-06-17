import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));

app.route('/', flue());

export default app;
