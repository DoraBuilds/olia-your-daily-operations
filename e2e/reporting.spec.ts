/**
 * E2E — Reporting tab (inside /checklists)
 *
 * Covers:
 *  1. Navigating to /checklists and switching to the Reporting tab
 *  2. Location filter dropdown renders
 *  3. Export CSV button renders
 *  4. Export PDF button renders
 *  5. The line chart SVG element renders when logs exist
 *  6. Clicking Export CSV triggers a download (doesn't crash)
 */
import { test, expect } from "@playwright/test";
import { injectAuth }   from "./fixtures/auth";
import { mockAllTables } from "./fixtures/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gotoReporting(page: import("@playwright/test").Page) {
  await injectAuth(page);
  await mockAllTables(page);
  await page.goto("/checklists");
  // Click the "Reporting" sub-tab
  await page.getByRole("button", { name: /Reporting/i }).click();
  // Wait for the reporting content to be visible
  await expect(page.getByText(/Logs & compliance overview/i)).toBeVisible();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Reporting — navigation", () => {
  test("switches to Reporting tab without crash", async ({ page }) => {
    await gotoReporting(page);
    // The location filter is only present on the Reporting tab
    await expect(page.getByTestId("location-filter")).toBeVisible();
  });
});

test.describe("Reporting — controls", () => {
  test("location filter dropdown is visible", async ({ page }) => {
    await gotoReporting(page);
    await expect(page.getByTestId("location-filter")).toBeVisible();
  });

  test("location filter shows 'All locations' option by default", async ({ page }) => {
    await gotoReporting(page);
    const select = page.getByTestId("location-filter");
    const val = await select.inputValue();
    expect(val.toLowerCase()).toMatch(/all/);
  });

  test("location filter lists mocked locations as options", async ({ page }) => {
    await gotoReporting(page);
    const select = page.getByTestId("location-filter");
    // Should have an "All" option plus one per mocked location (Main Kitchen, Terrace Bar)
    const count = await select.locator("option").count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("Export CSV button is visible", async ({ page }) => {
    await gotoReporting(page);
    await expect(page.getByTestId("export-csv")).toBeVisible();
  });

  test("Export PDF button is visible", async ({ page }) => {
    await gotoReporting(page);
    await expect(page.getByTestId("export-pdf")).toBeVisible();
  });
});

test.describe("Reporting — chart", () => {
  test("an SVG element (line chart) renders on the page", async ({ page }) => {
    await gotoReporting(page);
    // Recharts renders an <svg> element; wait for at least one
    const svgLocator = page.locator("svg").first();
    await expect(svgLocator).toBeVisible();
  });
});

test.describe("Reporting — export actions", () => {
  test("clicking Export CSV triggers a file download", async ({ page }) => {
    await gotoReporting(page);
    // Playwright can intercept downloads
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-csv").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test("clicking Export PDF does not crash the page", async ({ page }) => {
    await gotoReporting(page);
    // PDF export triggers a download — we just assert no error overlay appears
    page.on("dialog", dialog => dialog.dismiss());
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.getByTestId("export-pdf").click();
    await downloadPromise;
    // Page still functional — location filter still visible
    await expect(page.getByTestId("location-filter")).toBeVisible();
  });
});
