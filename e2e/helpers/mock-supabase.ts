/**
 * Playwright route helpers that intercept Supabase API calls and return
 * controlled fixture data.  Import these in any spec that needs Supabase.
 */
import { Page, Route } from "@playwright/test";

// ─── Auth session injection ──────────────────────────────────────────────────

/**
 * Inject a fake Supabase session into localStorage before the page loads.
 * This bypasses the Supabase auth check so ProtectedRoute lets you through.
 *
 * @param supabaseUrl  The VITE_SUPABASE_URL from your .env (any string works
 *                     for local testing — it is used as the localStorage key
 *                     prefix only).
 */
export async function injectFakeSession(page: Page, supabaseUrl: string) {
  // Supabase stores auth under "sb-<host>-auth-token"
  const host = new URL(supabaseUrl).hostname.split(".")[0];
  const key  = `sb-${host}-auth-token`;

  const fakeSession = {
    access_token:  "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_at:    Math.floor(Date.now() / 1000) + 3600,
    token_type:    "bearer",
    user: {
      id:    "00000000-0000-0000-0000-000000000001",
      email: "test@olia.app",
      role:  "authenticated",
    },
  };

  await page.addInitScript(
    ({ k, v }) => { localStorage.setItem(k, JSON.stringify(v)); },
    { k: key, v: fakeSession }
  );
}

// ─── Supabase REST API interception ──────────────────────────────────────────

/** Mock all GET/POST requests to the Supabase REST API with empty 200s. */
export async function mockSupabaseEmpty(page: Page) {
  await page.route("**/rest/v1/**", (route: Route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  // Auth token refresh — return a minimal 200
  await page.route("**/auth/v1/token**", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "fake", token_type: "bearer", expires_in: 3600 }),
    });
  });
}

/** Mock the `get_kiosk_checklists` RPC to return a controlled list. */
export async function mockKioskChecklists(
  page: Page,
  checklists: Array<{
    id: string;
    title: string;
    location_id: string;
    time_of_day: string;
    due_time: string | null;
    sections: unknown[];
  }>
) {
  await page.route("**/rest/v1/rpc/get_kiosk_checklists", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(checklists),
    });
  });
}

/** Mock the Supabase locations table. */
export async function mockLocations(
  page: Page,
  locations: Array<{ id: string; name: string }>
) {
  await page.route("**/rest/v1/locations*", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(locations),
    });
  });
}
