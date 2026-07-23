import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets parallel worktrees run isolated e2e servers. Without it we
// pin 4433 and may reuse an already-running dev server; with it, each run
// must start its own server on its own port (never reuse a foreign one).
const port = Number(process.env.E2E_PORT ?? 4433);

export default defineConfig({
  testDir: 'e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    port,
    reuseExistingServer: !process.env.E2E_PORT,
  },
});
