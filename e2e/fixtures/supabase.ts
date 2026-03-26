/**
 * Supabase route-mock helpers and shared fixture data for authenticated E2E specs.
 *
 * Usage pattern:
 *   1. Call injectAuth(page)              — injects fake session + mocks auth endpoints
 *   2. Call mockTable(page, "table", rows) — sets up REST response for that table
 *   3. Call mockRestFallback(page)         — catch-all: returns [] for any unmatched table
 *   4. Call page.goto(...)
 *
 * Route registration is LIFO in Playwright, so register specific table mocks AFTER
 * the catch-all. The last-registered route matching a URL is checked first.
 */
import type { Page } from "@playwright/test";
import { FAKE_TEAM_MEMBER } from "./auth";

// ─── Dates ───────────────────────────────────────────────────────────────────

export const TODAY     = "2026-03-26";
export const YESTERDAY = "2026-03-25";

// ─── Fixture objects ─────────────────────────────────────────────────────────

export const LOCATION_KITCHEN = { id: "loc-e2e-001", name: "Main Kitchen" };
export const LOCATION_TERRACE = { id: "loc-e2e-002", name: "Terrace Bar" };
export const ALL_LOCATIONS = [LOCATION_KITCHEN, LOCATION_TERRACE];

export const CHECKLIST_OVERDUE = {
  id:          "ck-e2e-overdue",
  title:       "Morning Kitchen Check",
  due_time:    "09:00",
  time_of_day: "morning",
  location_id: LOCATION_KITCHEN.id,
  folder_id:   null,
  schedule:    null,
  sections:    [],
  created_at:  YESTERDAY + "T10:00:00Z",
  updated_at:  YESTERDAY + "T10:00:00Z",
};

export const CHECKLIST_UPCOMING = {
  id:          "ck-e2e-upcoming",
  title:       "Evening Close",
  due_time:    "22:00",
  time_of_day: "evening",
  location_id: LOCATION_KITCHEN.id,
  folder_id:   null,
  schedule:    null,
  sections:    [],
  created_at:  YESTERDAY + "T10:00:00Z",
  updated_at:  YESTERDAY + "T10:00:00Z",
};

export const CHECKLIST_COMPLETED = {
  id:          "ck-e2e-completed",
  title:       "Afternoon Service Check",
  due_time:    "12:00",
  time_of_day: "afternoon",
  location_id: LOCATION_KITCHEN.id,
  folder_id:   null,
  schedule:    null,
  sections:    [],
  created_at:  YESTERDAY + "T10:00:00Z",
  updated_at:  YESTERDAY + "T10:00:00Z",
};

export const ALL_CHECKLISTS = [CHECKLIST_OVERDUE, CHECKLIST_UPCOMING, CHECKLIST_COMPLETED];

/** A log from today for the completed checklist. */
export const LOG_TODAY = {
  id:              "log-e2e-001",
  checklist_id:    CHECKLIST_COMPLETED.id,
  checklist_title: CHECKLIST_COMPLETED.title,
  completed_by:    "Jane Smith",
  staff_profile_id: null,
  score:           92,
  type:            "afternoon",
  answers:         [],
  created_at:      TODAY + "T13:00:00Z",
  location_id:     LOCATION_KITCHEN.id,
  started_at:      TODAY + "T12:50:00Z",
};

/** A historical log from yesterday (no started_at). */
export const LOG_YESTERDAY = {
  id:              "log-e2e-002",
  checklist_id:    CHECKLIST_COMPLETED.id,
  checklist_title: "Morning Service",
  completed_by:    "Tom B",
  staff_profile_id: null,
  score:           78,
  type:            "morning",
  answers:         [],
  created_at:      YESTERDAY + "T11:00:00Z",
  location_id:     LOCATION_TERRACE.id,
  started_at:      null,
};

export const ALL_LOGS = [LOG_TODAY, LOG_YESTERDAY];

/** An overdue action (due yesterday, still open). */
export const ACTION_OVERDUE = {
  id:              "act-e2e-001",
  checklist_id:    CHECKLIST_OVERDUE.id,
  checklist_title: CHECKLIST_OVERDUE.title,
  title:           "Fix broken thermometer",
  assigned_to:     "Jane Smith",
  due:             YESTERDAY + "T00:00:00Z",
  status:          "open",
  created_at:      YESTERDAY + "T09:00:00Z",
};

export const ALL_ACTIONS = [ACTION_OVERDUE];

/** Growth-plan organization (enables fileConvert + aiBuilder). */
export const ORG_GROWTH = {
  id:                       "org-e2e-test",
  name:                     "E2E Test Org",
  plan:                     "growth",
  plan_status:              "active",
  stripe_customer_id:       null,
  stripe_subscription_id:   null,
  trial_ends_at:            null,
};

// ─── Route helpers ────────────────────────────────────────────────────────────

/**
 * Mock a specific Supabase REST table with static row data.
 * Matches any query to that table (select, filter, order, etc.).
 */
export async function mockTable(
  page: Page,
  tableName: string,
  rows: unknown[]
): Promise<void> {
  await page.route(`**/rest/v1/${tableName}*`, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    const body = accept.includes("application/vnd.pgrst.object+json")
      ? JSON.stringify(rows[0] ?? null)
      : JSON.stringify(rows);

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
  });
}

/**
 * Catch-all: returns an empty array for any REST table not individually mocked.
 * Register this BEFORE specific table mocks (LIFO — specific mocks registered
 * after will take precedence).
 */
export async function mockRestFallback(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    // Let routes with dedicated handlers fall through to those more specific mocks.
    if (url.includes("/auth/")) {
      return route.continue();
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
}

/**
 * Mock a Supabase Edge Function call.
 *
 * @param fnName  The function name (e.g. "generate-checklist")
 * @param body    The JSON response body
 * @param status  HTTP status (default 200)
 */
export async function mockEdgeFunction(
  page: Page,
  fnName: string,
  body: unknown,
  status = 200
): Promise<void> {
  await page.route(`**/functions/v1/${fnName}*`, (route) => {
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/**
 * Set up all standard authenticated-page mocks:
 *   organizations → growth plan
 *   locations     → LOCATION_KITCHEN + LOCATION_TERRACE
 *   checklists    → ALL_CHECKLISTS
 *   checklist_logs→ ALL_LOGS
 *   actions       → ALL_ACTIONS
 *   alerts        → []
 *   folders       → []
 *   catch-all     → []
 *
 * Call this after injectAuth(page) and before page.goto().
 */
export async function mockAllTables(page: Page): Promise<void> {
  await mockRestFallback(page);
  await mockTable(page, "team_members", [FAKE_TEAM_MEMBER]);
  await mockTable(page, "organizations", [ORG_GROWTH]);
  await mockTable(page, "locations",     ALL_LOCATIONS);
  await mockTable(page, "checklists",    ALL_CHECKLISTS);
  await mockTable(page, "checklist_logs", ALL_LOGS);
  await mockTable(page, "actions",       ALL_ACTIONS);
  await mockTable(page, "alerts",        []);
  await mockTable(page, "folders",       []);
  // team_members already handled by injectAuth
}
