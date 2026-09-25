/**
 * E2E smoke tests — Kiosk PIN flow and authenticated manager path
 *
 * Issue #105: "Playwright live smoke: add kiosk PIN and authenticated manager flows"
 *
 * Covered:
 *
 * A. Kiosk checklist flow (no real Supabase calls — all routes mocked)
 *    1. Checklist grid loads and shows a checklist card
 *    2. Tapping a checklist opens it straight away — the identify PIN is the
 *       only PIN in a kiosk session, no second per-checklist PIN (#869)
 *
 * B. Manager login flow (Admin login modal)
 *    1. Admin button is visible on the kiosk grid
 *    2. Clicking Admin opens the Admin PIN modal (not the email/password modal)
 *    3. The Admin PIN modal has an input for the 4-digit PIN
 *    4. Entering an incorrect PIN shows an error message
 *    5. "Forgot your PIN?" link is visible
 *    6. Closing the Admin modal returns to the grid
 *
 * All Supabase RPC and REST calls are intercepted — no credentials required.
 */
import { test, expect } from "@playwright/test";
import { mockKioskChecklists, mockLocations } from "./helpers/mock-supabase";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LOCATION_ID   = "00000000-0000-0000-0000-000000000022";
const LOCATION_NAME = "Front of House";

const MOCK_CHECKLISTS = [
  {
    id:          "ck-pin-test-1",
    title:       "Opening Checklist",
    location_id: LOCATION_ID,
    time_of_day: "morning",
    due_time:    "09:00",
    sections:    [],
  },
  {
    id:          "ck-pin-test-2",
    title:       "Closing Checklist",
    location_id: LOCATION_ID,
    time_of_day: "evening",
    due_time:    "22:00",
    sections:    [],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Navigate straight to the kiosk grid (as a paired device)
 * by pre-seeding localStorage with the test location and mocking all Supabase calls.
 */
async function gotoGrid(page: import("@playwright/test").Page) {
  await mockKioskChecklists(page, MOCK_CHECKLISTS);
  await mockLocations(page, [{ id: LOCATION_ID, name: LOCATION_NAME }]);

  // Mock the validate_admin_pin RPC so entering a PIN never hits real Supabase.
  // Returns empty array → invalid PIN → shows error message.
  await page.route("**/rest/v1/rpc/validate_admin_pin", (route) => {
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        "[]",
    });
  });

  await page.addInitScript(
    ({ id, name }) => {
      localStorage.setItem("kiosk_location_id",  id);
      localStorage.setItem("kiosk_location_name", name);
      // Already signed in on the identify screen (#780).
      sessionStorage.setItem("kiosk_staff_session", JSON.stringify({
        staffId: null, memberId: "tm-e2e", staffName: "E2E Staff", organizationId: "org-e2e",
        departmentIds: [], expiresAt: Date.now() + 30 * 60 * 1000,
      }));
    },
    { id: LOCATION_ID, name: LOCATION_NAME },
  );

  await page.goto("/kiosk");
}

// ─── A. Kiosk checklist flow───────────────────────────────────────────────────────

test.describe("Kiosk — checklist flow", () => {
  test("checklist grid loads and shows mock checklist cards", async ({ page }) => {
    await gotoGrid(page);
    await expect(page.getByText("Opening Checklist")).toBeVisible();
    await expect(page.getByText("Closing Checklist")).toBeVisible();
  });

  test("tapping a checklist opens it without a second PIN", async ({ page }) => {
    await gotoGrid(page);
    // Each checklist card has id="checklist-card-{id}"
    await page.locator(`#checklist-card-${MOCK_CHECKLISTS[0].id}`).click();
    await expect(page.getByRole("button", { name: /complete checklist/i })).toBeVisible();
    await expect(page.getByText("Insert PIN")).not.toBeVisible();
  });
});

// ─── B. Manager login flow ────────────────────────────────────────────────────

test.describe("Kiosk — Manager (Admin PIN) login flow", () => {
  test("Admin button is visible on the kiosk grid", async ({ page }) => {
    await gotoGrid(page);
    await expect(page.locator("#admin-btn")).toBeVisible();
  });

  test("clicking Admin opens the Admin PIN modal", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    // The kiosk Admin modal uses id="admin-pin-input" for its PIN field
    await expect(page.locator("#admin-pin-input")).toBeVisible();
  });

  test("Admin PIN modal shows 'Admin PIN' heading", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    await expect(page.getByText("Admin PIN")).toBeVisible();
  });

  test("Admin PIN modal has a 4-digit PIN input field", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    const pinInput = page.locator("#admin-pin-input");
    await expect(pinInput).toBeVisible();
    // Should accept exactly 4 characters (maxLength)
    const maxLen = await pinInput.getAttribute("maxlength");
    expect(maxLen).toBe("4");
  });

  test("submitting an incorrect PIN shows an error message", async ({ page }) => {
    // Mock validate_admin_pin to return empty → invalid PIN
    await mockKioskChecklists(page, MOCK_CHECKLISTS);
    await mockLocations(page, [{ id: LOCATION_ID, name: LOCATION_NAME }]);
    await page.route("**/rest/v1/rpc/validate_admin_pin", (route) => {
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        "[]",
      });
    });
    await page.addInitScript(
      ({ id, name }) => {
        localStorage.setItem("kiosk_location_id",  id);
        localStorage.setItem("kiosk_location_name", name);
      },
      { id: LOCATION_ID, name: LOCATION_NAME },
    );
    await page.goto("/kiosk");

    await page.locator("#admin-btn").click();
    await page.locator("#admin-pin-input").fill("0000");
    await page.locator("#admin-pin-signin-btn").click();

    // Should show an error — either "Invalid PIN" or a generic error
    await expect(
      page.locator("p", { hasText: /invalid pin|invalid|error|try again/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("'Forgot your PIN?' link is visible in the Admin PIN modal", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    await expect(page.getByText(/forgot your pin/i)).toBeVisible();
  });

  test("closing the Admin PIN modal returns to the kiosk grid", async ({ page }) => {
    await gotoGrid(page);
    await page.locator("#admin-btn").click();
    await expect(page.locator("#admin-pin-input")).toBeVisible();

    // The modal has a close / dismiss control — look for a button with × or ✕ or an
    // aria-label, or use Escape key which most dialogs handle.
    const closeBtn = page.locator("button[aria-label='Close']").first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }

    // Grid heading should be visible again
    await expect(page.getByText(/what's on the agenda/i)).toBeVisible();
  });
});
