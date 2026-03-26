import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // This config lives inside e2e/, so "." is the spec directory.
  testDir: ".",
  timeout: 30_000,
  retries: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    // Capture screenshots and traces only on failure
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Do NOT run a webServer block here — start bun run dev manually
  // before running e2e tests (see Run Instructions below).
});
