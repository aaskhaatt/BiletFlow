import { defineConfig, devices } from '@playwright/test'

/*
 * End-to-end tests against the real local backend (start it first, see README).
 * They run in the installed Google Chrome (channel "chrome"), so no browser
 * download is needed. To use Playwright's own Chromium instead, run
 * "npx playwright install chromium" and remove the channel line.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  // Starts the dev server unless one is already running on 5173
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
