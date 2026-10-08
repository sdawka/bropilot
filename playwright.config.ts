import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8794', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'npm run dev:worker', url: 'http://127.0.0.1:8794/api/v1/examples', timeout: 60000, reuseExistingServer: false, env: { BROPILOT_EPHEMERAL_SESSION: '1', BROPILOT_LOCAL_PORT: '8794' } },
});
