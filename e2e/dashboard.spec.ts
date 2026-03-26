/**
 * E2E — Dashboard page
 *
 * Covers:
 *  1. Greeting renders with the authenticated user's name
 *  2. Stat strip shows today's counts
 *  3. "Today" compliance tab shows location cards when logs exist
 *  4. Clicking a location card drills in and shows checklist rows
 *  5. Back arrow returns to the location list
 *  6. "Overdue" tab shows missed checklist and overdue action
 *
 * Time is frozen at 14:00 on 2026-03-26 via page.clock so that:
 *   - CHECKLIST_OVERDUE (due_time "09:00") is correctly detected as overdue
 *   - CHECKLIST_UPCOMING (due_time "22:00") is NOT overdue
 */
import { test, expect } from "@playwright/test";
import { injectAuth }  from "./fixtures/auth";
import {
  mockAllTables,
  LOCATION_KITCHEN,
  CHECKLIST_OVERDUE,
  ACTION_OVERDUE,
  LOG_TODAY,
} from "./fixtures/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gotoDashboard(page: import("@playwright/test").Page) {
  // Fix the browser clock at 14:00 on the test date so overdue logic is deterministic
  await page.clock.setSystemTime(new Date("2026-03-26T14:00:00"));

  await injectAuth(page);
  await mockAllTables(page);
  await page.goto("/dashboard");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Dashboard — greeting", () => {
  test("shows a greeting with the authenticated user name", async ({ page }) => {
    await gotoDashboard(page);
    const heading = page.locator("#dashboard-greeting");
    await expect(heading).toBeVisible();
    // Name comes from FAKE_TEAM_MEMBER.name = "E2E Tester"
    await expect(heading).toContainText("E2E Tester");
  });

  test("shows today's date label above the greeting", async ({ page }) => {
    await gotoDashboard(page);
    // Date label is an uppercase string like "THURSDAY, 26 MARCH 2026"
    await expect(page.locator("p.uppercase.tracking-widest").first()).toBeVisible();
  });
});

test.describe("Dashboard — stat strip", () => {
  test("shows 'Checklists', 'Alerts', and 'Overdue' stat cards", async ({ page }) => {
    await gotoDashboard(page);
    await expect(page.getByText("Checklists")).toBeVisible();
    await expect(page.getByText("Alerts")).toBeVisible();
    await expect(page.getByText("Overdue")).toBeVisible();
  });

  test("Overdue card shows ≥1 when there is an overdue checklist", async ({ page }) => {
    await gotoDashboard(page);
    // The overdue count is rendered just above the "Overdue" label
    const overdueCard = page.locator("div.bg-card", { hasText: "Overdue" });
    const countText = await overdueCard.locator("p.text-xl").textContent();
    expect(Number(countText)).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Dashboard — compliance: location cards", () => {
  test("shows 'Daily compliance' section heading", async ({ page }) => {
    await gotoDashboard(page);
    await expect(page.getByText("Daily compliance")).toBeVisible();
  });

  test("Today tab shows the kitchen location card when a log exists today", async ({ page }) => {
    await gotoDashboard(page);
    // Default tab is "today". LOG_TODAY is for LOCATION_KITCHEN.
    const cards = page.getByTestId("location-card");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first()).toContainText(LOCATION_KITCHEN.name);
  });

  test("location card shows the avg score percentage", async ({ page }) => {
    await gotoDashboard(page);
    const card = page.getByTestId("location-card").first();
    // LOG_TODAY.score = 92 → displays "92%"
    await expect(card).toContainText(`${LOG_TODAY.score}%`);
  });

  test("clicking a location card drills in and shows 'Tap to drill in' gone", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("location-card").first().click();
    // After drill-in, location cards disappear and checklist cards appear
    await expect(page.getByTestId("location-card")).toHaveCount(0);
  });

  test("drill-in shows the checklist name and score", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("location-card").first().click();
    // Checklist title from LOG_TODAY
    await expect(page.getByText(LOG_TODAY.checklist_title)).toBeVisible();
  });

  test("back arrow returns to location list view", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("location-card").first().click();
    // Back button has aria-label="Back to locations"
    await page.getByRole("button", { name: "Back to locations" }).click();
    // Location cards should be visible again
    await expect(page.getByTestId("location-card").first()).toBeVisible();
  });
});

test.describe("Dashboard — compliance: Yesterday tab", () => {
  test("clicking Yesterday tab switches the view without crashing", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("compliance-tab-yesterday").click();
    // Yesterday log is for Terrace Bar
    await expect(page.getByText(/Daily compliance/i)).toBeVisible();
  });
});

test.describe("Dashboard — overdue tab", () => {
  test("clicking Overdue tab shows the missed checklist", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("compliance-tab-overdue").click();
    // Checklist with due_time "09:00" at 14:00 → overdue
    await expect(page.getByTestId("overdue-checklist-item").first()).toBeVisible();
    await expect(page.getByText(CHECKLIST_OVERDUE.title)).toBeVisible();
  });

  test("overdue checklist shows 'Due by 09:00 — not completed'", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("compliance-tab-overdue").click();
    await expect(page.getByText(/Due by 09:00 — not completed/i)).toBeVisible();
  });

  test("overdue action 'Fix broken thermometer' appears in overdue tab", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByTestId("compliance-tab-overdue").click();
    await expect(page.getByText(ACTION_OVERDUE.title)).toBeVisible();
  });

  test("overdue badge count on tab is ≥ 1", async ({ page }) => {
    await gotoDashboard(page);
    const overdueTab = page.getByTestId("compliance-tab-overdue");
    // The badge is a child <span> with the count
    const badge = overdueTab.locator("span");
    await expect(badge).toBeVisible();
    const count = await badge.textContent();
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });
});
