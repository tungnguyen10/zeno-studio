import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:43627' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'mobile-chrome', use: devices['Pixel 7'] },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43627',
    url: 'http://127.0.0.1:43627',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
