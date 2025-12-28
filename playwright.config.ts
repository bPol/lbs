import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    browserName: 'firefox',
    baseURL: 'http://localhost:7007',
    trace: 'on-first-retry',
  },
})
