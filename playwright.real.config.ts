import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-real",
  outputDir: "./test-results/real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: [
    {
      command: "backend/.venv/bin/python backend/tests/live_server.py",
      url: "http://127.0.0.1:8011/docs",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 20_000 },
    },
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: {
        VITE_USE_MOCKS: "false",
        VITE_API_BASE_URL: "http://127.0.0.1:8011/api/v1",
        VITE_WS_URL: "ws://127.0.0.1:8011/api/v1/auth/ws",
      },
    },
  ],
});
