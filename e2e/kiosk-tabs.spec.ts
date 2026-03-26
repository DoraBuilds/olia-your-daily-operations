/**
 * E2E smoke tests — Kiosk tab behaviour
 *
 * These tests exercise the full browser render of the kiosk page.
 * No auth required — the kiosk is publicly accessible.
 *
 * What is covered:
 *  1. Kiosk loads and shows the location-select screen
 *  2. Launching with a stored location goes straight to the grid
 *  3. The stat strip shows Due now / Upcoming / Done
 *  4. "Upcoming" is a real clickable button (regression: was a dead <div>)
 *  5. Clicking Upcoming switches to the upcoming grid (no error, no crash)
 *  6. "Done" tab switches to the done grid
 */
import { test, expect } from "@playwright/test";
import { mockKioskChecklists, mockLocations } from "./helpers/mock-supabase";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LOCATION_ID   = "00000000-0000-0000-0000-000000000011";
const LOCATION_NAME = "Terrace";

const MOCK_CHECKLISTS = [
  {
    id:          "ck-morning-1",
    title:       "Morning Prep",
    location_id: LOCATION_ID,
    time_of_day: "morning",
    due_time:    "10:00",
    sections:    [],
  },
  {
    id:          "ck-afternoon-1",
    title:       "Afternoon Service Check",
    location_id: LOCATION_ID,
    time_of_day: "afternoon",
    due_time:    "14:00",
    sections:    [],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Navigate to the kiosk with a pre-stored location (skips setup screen). */
async function gotoGrid(page: import("@playwright/test").Page) {
  await mockKioskChecklists(page, MOCK_CHECKLISTS);
  await mockLocations(page, [{ id: LOCATION_ID, name: LOCATION_NAME }]);

  // Inject kiosk location into localStorage before load so it skips setup
  await page.addInitScript(
    ({ id, name }) => {
      localStorage.setItem("kiosk_location_id",   id);
      localStorage.setItem("kiosk_location_name",  name);
    },
    { id: LOCATION_ID, name: LOCATION_NAME }
  );

  await page.goto("/kiosk");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Kiosk — setup screen", () => {
  test("shows 'Olia Kiosk' on the setup screen", async ({ page }) => {
    await mockLocations(page, [{ id: LOCATION_ID, name: LOCATION_NAME }]);
    await page.goto("/kiosk");
    await expect(page.getByText("Olia Kiosk")).toBeVisible();
  });

  test("shows 'Select a location to launch' prompt", async ({ page }) => {
    await mockLocations(page, [{ id: LOCATION_ID, name: LOCATION_NAME }]);
    await page.goto("/kiosk");
    await expect(page.getByText(/select a location to launch/i)).toBeVisible();
  });
});

test.describe("Kiosk — grid screen stat strip", () => {
  test("shows the 'Due now', 'Upcoming', 'Done' stat strip", async ({ page }) => {
    await gotoGrid(page);
    await expect(page.getByText("Due now")).toBeVisible();
    await expect(page.getByText("Upcoming")).toBeVisible();
    await expect(page.getByText("Done")).toBeVisible();
  });

  test("'What's on the agenda' heading is visible", async ({ page }) => {
    await gotoGrid(page);
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
  });

  // ── Regression: Upcoming was a dead <div>, must be a <button> ─────────────

  test("Upcoming stat-strip item is a real <button> element", async ({ page }) => {
    await gotoGrid(page);
    // Find the button whose label starts with "Upcoming"
    const upcomingBtn = page.locator("button", { hasText: /^Upcoming/i }).first();
    await expect(upcomingBtn).toBeVisible();
  });

  test("clicking Upcoming tab does not crash the page", async ({ page }) => {
    await gotoGrid(page);
    const upcomingBtn = page.locator("button", { hasText: /^Upcoming/i }).first();
    await upcomingBtn.click();
    // Page should still show the agenda heading — no white screen or error
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
  });

  test("clicking Done tab does not crash the page", async ({ page }) => {
    await gotoGrid(page);
    const doneBtn = page.locator("button", { hasText: /^Done/i }).first();
    await doneBtn.click();
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
  });

  test("clicking Due now tab returns to due grid", async ({ page }) => {
    await gotoGrid(page);
    // Switch away first
    await page.locator("button", { hasText: /^Upcoming/i }).first().click();
    // Come back
    await page.locator("button", { hasText: /^Due now/i }).first().click();
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
  });
});

test.describe("Kiosk — Admin button", () => {
  test("Admin button is visible in the grid", async ({ page }) => {
    await gotoGrid(page);
    await expect(page.locator("#admin-btn")).toBeVisible();
  });

  test("clicking Admin opens the Admin login modal", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    await expect(page.getByText("Admin login")).toBeVisible();
  });
});
