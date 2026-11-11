import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: "npx vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
