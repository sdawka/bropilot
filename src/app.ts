import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: { ASSETS?: Fetcher } }>();

app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));

app.route('/', flue());

// Serve static assets via ASSETS binding (production) or fallback to 404
app.get('*', async (c) => {
  const assets = c.env?.ASSETS;
  if (assets) {
    return assets.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;
