import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const url = `http://localhost:${port}`;

// One smoke test of the built site, in the two engines phones ship. `vite
// preview` serves dist/ without the _headers CSP; test/deploy-config.test.ts
// covers the CSP.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: url },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `vite build && vite preview --port ${port} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
  },
});
