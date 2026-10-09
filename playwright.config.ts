/// <reference types="node" />
import { defineConfig } from '@playwright/test';

// Browser tests run against the app in demo mode (data in the browser's localStorage, no Supabase),
// so they are fast, repeatable and never touch real club data. Run with `bun run test:e2e`.
const PORT = 4321;
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const seeded = { storageState: 'e2e/.state/seed.json' };

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results/artifacts',
  timeout: 90_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-results/report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 8_000,
  },
  projects: [
    // Builds the demo club (sails, reservations, sign-ups, requests) once, through the UI
    { name: 'seed', testMatch: /seed\.setup\.ts/, use: phone },
    // Every screen and window, at four screen sizes
    { name: 'screens-320', testMatch: /screens\.spec\.ts/, dependencies: ['seed'], use: { ...phone, ...seeded, viewport: { width: 320, height: 640 } } },
    { name: 'screens-390', testMatch: /screens\.spec\.ts/, dependencies: ['seed'], use: { ...phone, ...seeded } },
    { name: 'screens-768', testMatch: /screens\.spec\.ts/, dependencies: ['seed'], use: { ...seeded, viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'screens-1440', testMatch: /screens\.spec\.ts/, dependencies: ['seed'], use: { ...seeded, viewport: { width: 1440, height: 900 } } },
    // Every button on every screen; user journeys; accessibility and touch-target checks
    { name: 'buttons', testMatch: /buttons\.spec\.ts/, dependencies: ['seed'], use: { ...phone, ...seeded } },
    { name: 'flows-phone', testMatch: /flows\.spec\.ts/, dependencies: ['seed'], use: { ...phone, ...seeded } },
    { name: 'flows-desktop', testMatch: /flows\.spec\.ts/, dependencies: ['seed'], use: { ...seeded, viewport: { width: 1440, height: 900 } } },
    { name: 'quality', testMatch: /quality\.spec\.ts/, dependencies: ['seed'], use: { ...phone, ...seeded } },
  ],
  webServer: {
    command: `bunx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Empty Supabase settings → demo mode, even when .env.local has the real project
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
