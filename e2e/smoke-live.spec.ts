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
 *  2. /kiosk loads and shows the kiosk setup screen
 *  3. Protected route /dashboard redirects to /login (not a 404)
 *  4. Protected route /admin redirects to /login (not a 404)
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

// A fresh Playwright browser context has no localStorage, so it never has a
// "kiosk_location_id" set — Kiosk.tsx's `!locationId` branch means every
// anonymous visit to /kiosk lands on KioskSetupScreen ("Olia Kiosk" / "Select
// a location to launch"), never the agenda grid. Assert on that, not on
// agenda-grid content that only a previously-configured device would see —
// asserting the grid text here could never pass against a real stateless
// visit (see #597-adjacent investigation: this is why /kiosk had never
// actually passed in this workflow's history, independent of the CLI/deps
// issues fixed in #598 and the smoke.yml dependency-install fix alongside
// this change).
test.describe("Smoke: /kiosk", () => {
  test("loads and shows the kiosk setup screen", async ({ page }) => {
    await page.goto(url("/kiosk"));
    await expect(page.getByText(/select a location to launch/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ProtectedRoute only redirects to /kiosk for a device that's already
// configured as a kiosk (localStorage "kiosk_location_id" set) — see
// src/components/ProtectedRoute.tsx. A fresh Playwright context has no such
// state, so for this visitor ProtectedRoute falls through to its `!user`
// branch and redirects to /login instead. That's the real, correct behavior
// to check here; asserting a /kiosk landing (as this suite originally did)
// doesn't match how an anonymous visitor's browser actually behaves.
test.describe("Smoke: protected routes redirect to /login", () => {
  test("/dashboard redirects to /login — not a 404", async ({ page }) => {
    await page.goto(url("/dashboard"));
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/sign in/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("/admin redirects to /login — not a 404", async ({ page }) => {
    await page.goto(url("/admin"));
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/sign in/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
