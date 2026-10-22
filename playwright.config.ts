import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.browser.ts', workers: 1, timeout: 30_000,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173/DitherIT/', browserName: 'chromium', viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-static.mjs', url: 'http://127.0.0.1:4173/DitherIT/',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_STATIC_SERVER === '1' },
});
