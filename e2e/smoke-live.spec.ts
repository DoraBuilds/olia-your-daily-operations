/**
 * Post-deploy smoke regression — runs against the live GitHub Pages URL.
 *
 * These checks are intentionally minimal: they verify the deployed artefact
 * is reachable and the SPA shell is working, NOT full feature flows.
 *
 * The target URL is controlled by the SMOKE_BASE_URL environment variable
 * (set in the smoke.yml workflow). When running locally you can pass it as:
 *   SMOKE_BASE_URL=https://<owner>.github.io/<repo> npx playwright test e2e/smoke-live.spec.ts --config e2e/playwright.smoke.config.ts
 *
 * Checks:
 *  1. App root loads (HTTP 200, page has content)
 *  2. /kiosk loads and shows "What's on the agenda"
 *  3. Protected route /dashboard redirects to /kiosk (not a 404)
 *  4. Protected route /admin redirects to /kiosk (not a 404)
 *  5. No uncaught JavaScript errors on the home page
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve an app path relative to SMOKE_BASE_URL.
 * The base URL may or may not include a trailing slash.
 */
function url(path: string): string {
  const base = (process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Smoke: app root", () => {
  test("root URL returns HTTP 200 and has page content", async ({ page }) => {
    const response = await page.goto(url("/"));
    // GitHub Pages serves 200 for the SPA index even with a base path
    expect(response?.status()).toBe(200);
    // The HTML shell must have some content — not a blank page
    const body = await page.locator("body").innerHTML();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("no uncaught JavaScript errors on the home page", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto(url("/"));
    // Give React a moment to hydrate
    await page.waitForLoadState("networkidle");

    expect(jsErrors).toHaveLength(0);
  });
});

test.describe("Smoke: /kiosk", () => {
  test("loads and shows 'What's on the agenda'", async ({ page }) => {
    await page.goto(url("/kiosk"));
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Smoke: protected routes redirect to /kiosk", () => {
  test("/dashboard redirects to /kiosk — not a 404", async ({ page }) => {
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    // The app should land on /kiosk (ProtectedRoute behaviour), not a blank/404
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("/admin redirects to /kiosk — not a 404", async ({ page }) => {
    await page.goto(url("/admin"));
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/what's on the agenda/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
