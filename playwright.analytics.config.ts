import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'analytics.spec.ts',
  use: { baseURL: 'http://127.0.0.1:43627' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43627',
    env: { NUXT_PUBLIC_GA4_ENABLED: 'true', NUXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-2GD5P03B7S' },
    url: 'http://127.0.0.1:43627',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
