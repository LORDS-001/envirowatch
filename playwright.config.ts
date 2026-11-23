import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/mock",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  workers: 2,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --port 5174 --strictPort",
    env: { VITE_USE_MOCKS: "true", VITE_API_BASE_URL: "/api/v1", VITE_WS_URL: "ws://localhost:5174/ws" },
    url: "http://localhost:5174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
