/**
 * Auth helpers for Playwright E2E tests.
 *
 * Supabase JS v2 reads the session from localStorage synchronously on startup
 * using a key like `sb-<project-ref>-auth-token`.  We override localStorage.getItem
 * in addInitScript so ANY key matching that pattern returns our fake session —
 * regardless of which Supabase project is configured in the env.
 *
 * The token refresh HTTP call is also intercepted so the session is never
 * challenged or expired during tests.
 */
import type { Page } from "@playwright/test";

export const FAKE_USER_ID   = "00000000-0000-0000-0000-000000000001";
export const FAKE_USER_EMAIL = "e2e@olia.app";
export const FAKE_ORG_ID    = "org-e2e-test";

export const FAKE_TEAM_MEMBER = {
  id:              "tm-e2e-001",
  user_id:         FAKE_USER_ID,
  organization_id: FAKE_ORG_ID,
  name:            "E2E Tester",
  email:           FAKE_USER_EMAIL,
  role:            "Owner",
  location_ids:    [],
  permissions:     {},
};

const FAKE_SESSION = {
  access_token:  "fake-e2e-access-token",
  token_type:    "bearer",
  expires_in:    3600,
  expires_at:    Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "fake-e2e-refresh-token",
  user: {
    id:                  FAKE_USER_ID,
    aud:                 "authenticated",
    role:                "authenticated",
    email:               FAKE_USER_EMAIL,
    email_confirmed_at:  "2026-01-01T00:00:00.000Z",
    created_at:          "2026-01-01T00:00:00.000Z",
    updated_at:          "2026-01-01T00:00:00.000Z",
  },
};

/**
 * Call this BEFORE page.goto() to inject a fake auth session.
 * Works by:
 *   1. Overriding localStorage.getItem in the page so any Supabase auth key
 *      returns the fake session object.
 *   2. Mocking the Supabase auth/v1 endpoints so token refreshes succeed.
 *   3. Mocking team_members REST endpoint to return the fake team member.
 */
export async function injectAuth(page: Page): Promise<void> {
  // ── localStorage injection (synchronous path on startup) ──────────────────
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        return JSON.stringify(session);
      }
      return orig.call(this, key);
    };
  }, FAKE_SESSION);

  // ── Auth HTTP endpoints ────────────────────────────────────────────────────
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    // Token refresh — return a fresh token
    if (url.includes("/token")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_SESSION),
      });
    }
    // User fetch
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_SESSION.user),
    });
  });

  // ── team_members (AuthContext secondary fetch) ─────────────────────────────
  await page.route("**/rest/v1/team_members*", (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    const body = accept.includes("application/vnd.pgrst.object+json")
      ? JSON.stringify(FAKE_TEAM_MEMBER)
      : JSON.stringify([FAKE_TEAM_MEMBER]);

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
  });
}
