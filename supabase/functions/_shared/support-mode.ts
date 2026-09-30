// Platform-admin "support mode" for edge functions
// (see 20260930000001_support_mode_edge_functions.sql).
//
// While a platform admin is viewing a customer org, the database treats
// them as that org's owner. Edge functions use the service-role key, so
// they have to ask explicitly: resolveSupportMode() returns the org the
// caller is viewing (or null), and the function then either acts on that
// org as owner or refuses.

// Structural type so this works with whichever supabase-js build the
// calling function imports.
interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export const SUPPORT_MODE_REFUSED_MESSAGE = "Not available in support mode";
export const SUPPORT_MODE_CHECK_FAILED_MESSAGE = "Could not verify support mode";

export interface SupportMode {
  // The org the caller is viewing in support mode, or null.
  orgId: string | null;
  // True when the lookup itself failed — callers must stop, not fall
  // through to the caller's own org.
  failed: boolean;
}

export async function resolveSupportMode(admin: RpcClient, userId: string): Promise<SupportMode> {
  try {
    const { data, error } = await admin.rpc("platform_admin_viewing_org_for", { p_user_id: userId });
    if (error) {
      console.error("support-mode: lookup failed", error.message);
      return { orgId: null, failed: true };
    }
    return { orgId: typeof data === "string" ? data : null, failed: false };
  } catch (e: unknown) {
    console.error("support-mode: lookup threw", e instanceof Error ? e.message : String(e));
    return { orgId: null, failed: true };
  }
}

// Best-effort: an audit-log hiccup never fails the action itself.
export async function logSupportModeAction(
  admin: RpcClient,
  userId: string,
  orgId: string,
  functionName: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await admin.rpc("platform_admin_log_for", {
      p_user_id: userId,
      p_org_id: orgId,
      p_action: "edge_function",
      p_detail: { function: functionName, ...detail },
    });
    if (error) console.error("support-mode: audit log failed", error.message);
  } catch (e: unknown) {
    console.error("support-mode: audit log threw", e instanceof Error ? e.message : String(e));
  }
}
