// @ts-check
import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://bropilot.pages.dev',
  outDir: 'dist',
  adapter: node({ mode: 'standalone' }),
  integrations: [alpinejs()],
});
