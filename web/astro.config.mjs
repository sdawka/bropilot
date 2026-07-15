import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [vue()],
  // Pin the port so the dev-server origin never drifts — localStorage
  // (bropilot:graph:v1) is scoped per-origin, so a changed port = empty data.
  // strictPort makes a busy port fail loudly instead of silently bumping.
  server: { port: 4433, strictPort: true },
  vite: {
    plugins: [tailwindcss()],
  },
});
