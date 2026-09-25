// Platform-admin "support mode" (see 20260925000010_platform_admin_support_mode.sql).
//
// While a platform admin is viewing a customer org, the database treats
// them as that org's owner. Edge functions don't: they resolve the org
// from the caller's own team_members row, so billing, invites, account
// deletion etc. would silently act on the admin's own org instead. Those
// calls are refused here, in one place, for as long as support mode is on.

export const SUPPORT_MODE_BLOCKED_FUNCTIONS = new Set([
  "delete-my-account",
  "manage-subscription",
  "create-checkout-session",
  "confirm-checkout-session",
  "sync-location-quantity",
  "invite-team-member",
  "check-checklist-alerts",
]);

export const SUPPORT_MODE_BLOCKED_MESSAGE = "Not available in support mode";

let supportModeActive = false;

export function setSupportModeActive(active: boolean) {
  supportModeActive = active;
}

export function isSupportModeActive() {
  return supportModeActive;
}

export function isBlockedInSupportMode(functionName: string) {
  return supportModeActive && SUPPORT_MODE_BLOCKED_FUNCTIONS.has(functionName);
}

function functionNameFromUrl(input: RequestInfo | URL): string | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const match = url.match(/\/functions\/v1\/([^/?#]+)/);
  return match ? match[1] : null;
}

// The Supabase client's fetch: every edge-function call goes through it,
// so blocked calls are refused with a 403 before they leave the browser.
export const supportModeFetch: typeof fetch = (input, init) => {
  const functionName = functionNameFromUrl(input);
  if (functionName && isBlockedInSupportMode(functionName)) {
    return Promise.resolve(new Response(
      JSON.stringify({ error: SUPPORT_MODE_BLOCKED_MESSAGE }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ));
  }
  return fetch(input, init);
};
