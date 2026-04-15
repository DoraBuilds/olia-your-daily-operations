/**
 * Playwright config for post-deploy smoke tests against the live GitHub Pages
 * URL.  Used only by .github/workflows/smoke.yml.
 *
 * Key differences from the default playwright.config.ts:
 *  - testMatch targets only smoke-live.spec.ts
 *  - baseURL is irrelevant here; smoke-live.spec.ts constructs absolute URLs
 *    from SMOKE_BASE_URL itself so that the spec works without a running server.
 *  - retries: 2  — flake tolerance for live network latency
 *  - No webServer block — tests hit the already-deployed Pages URL directly
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["smoke-live.spec.ts"],
  timeout: 30_000,
  retries: 2,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/smoke" }],
  ],
  outputDir: "test-results/smoke",

  use: {
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
});
