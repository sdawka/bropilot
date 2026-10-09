import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': {
    target: 'http://127.0.0.1:8791', changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        // Preserve rejected origins/sites; translate only same-origin local
        // Vite requests to the authenticated Worker's origin.
        const origin = incoming.headers.origin;
        if (origin !== `http://${incoming.headers.host}`) return;
        const host = new URL(origin).hostname;
        if (['127.0.0.1', 'localhost', '[::1]'].includes(host)) outgoing.setHeader('origin', 'http://127.0.0.1:8791');
      });
    },
  } } },
  test: { environment: 'jsdom' },
});
