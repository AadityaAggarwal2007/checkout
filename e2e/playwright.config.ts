import { defineConfig } from '@playwright/test';

/**
 * End-to-end: the real API server (dev catalog), the local test store and the dashboard, driven in
 * Chromium. Needs PostgreSQL with the E2E database migrated and seeded (scripts in package.json).
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://checkout:checkout@localhost:5432/checkout_e2e';
const serverEnv = {
  NODE_ENV: 'development',
  PORT: '5102',
  PUBLIC_URL: 'http://localhost:5102',
  DASHBOARD_URL: 'http://localhost:5103',
  DATABASE_URL: DB,
  JWT_SECRET: 'ZTJlLWp3dC1zZWNyZXQtZTJlLWp3dC1zZWNyZXQtZTJlLWp3dC1zZWNyZXQ=',
  ENCRYPTION_KEYS: 'k1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  HASH_PEPPER: 'ZTJlLXBlcHBlci1lMmUtcGVwcGVyLWUyZS1wZXBwZXItZTJl',
  CATALOG: 'dev',
  DEV_CATALOG_FILE: '../devstore/catalog.json',
  DEV_STORE_URL: 'http://localhost:5104',
  STOREFRONT_DIST: '../storefront/dist/loader.js',
};

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    headless: true,
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npx tsx src/main.ts', cwd: '../apps/server', port: 5102, env: serverEnv, reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx tsx server.ts', cwd: '../apps/devstore', port: 5104, env: { PORT: '5104', API_URL: 'http://localhost:5102', WIDGET_KEY: 'dev-widget-key' }, reuseExistingServer: false },
    { command: 'npx next dev -p 5103', cwd: '../apps/dashboard', port: 5103, env: { API_URL: 'http://localhost:5102' }, reuseExistingServer: false, timeout: 120_000 },
  ],
});
