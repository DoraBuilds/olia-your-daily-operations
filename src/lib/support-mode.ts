// Platform-admin "support mode" (see 20260925000010_platform_admin_support_mode.sql).
//
// While a platform admin is viewing a customer org, the database treats
// them as that org's owner, and most edge functions act on the viewed org
// too (supabase/functions/_shared/support-mode.ts). Billing decisions and
// account deletion stay with the customer: the functions below refuse
// server-side in support mode, and are refused here as well so the call
// never leaves the browser.

export const SUPPORT_MODE_BLOCKED_FUNCTIONS = new Set([
  "delete-my-account",
  "manage-subscription",
  "create-checkout-session",
  "confirm-checkout-session",
]);

export const SUPPORT_MODE_BLOCKED_MESSAGE = "Not available in support mode";

let supportModeActive = false;

export function setSupportModeActive(active: boolean) {
  supportModeActive = active;
}

export function isSupportModeActive() {
  return supportModeActive;
}

// In support mode teamMember is a synthetic owner profile whose id is the
// admin's own login, not a team_members row in the viewed org. Anything
// written to a team_members foreign key (created_by, performed_by,
// team_member_id) must go through this, or the insert fails on the FK —
// or, for an admin who also runs their own org, credits a stranger.
export function teamMemberRefId(id: string | null | undefined): string | null {
  return supportModeActive ? null : id ?? null;
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
