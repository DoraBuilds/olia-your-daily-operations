import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["live-*.spec.ts"],
  timeout: 30_000,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/live" }],
  ],
  outputDir: "test-results/live",
  use: {
    baseURL: "http://127.0.0.1:4273",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "../scripts/run-live-playwright-dev-server.sh",
    url: "http://127.0.0.1:4273",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
