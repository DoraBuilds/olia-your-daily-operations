import { describe, expect, it, vi } from "vitest";

import {
  logSupportModeAction,
  resolveSupportMode,
} from "../../../supabase/functions/_shared/support-mode";

const USER = "11111111-1111-1111-1111-111111111111";
const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("edge-function support mode helper", () => {
  it("returns the org a platform admin is viewing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ORG, error: null });
    expect(await resolveSupportMode({ rpc }, USER)).toEqual({ orgId: ORG, failed: false });
    expect(rpc).toHaveBeenCalledWith("platform_admin_viewing_org_for", { p_user_id: USER });
  });

  it("returns no org for callers who aren't in support mode", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await resolveSupportMode({ rpc }, USER)).toEqual({ orgId: null, failed: false });
  });

  it("reports a failed lookup instead of falling through to the caller's own org", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await resolveSupportMode({ rpc: failing }, USER)).toEqual({ orgId: null, failed: true });
    const throwing = vi.fn().mockRejectedValue(new Error("network"));
    expect(await resolveSupportMode({ rpc: throwing }, USER)).toEqual({ orgId: null, failed: true });
    spy.mockRestore();
  });

  it("writes an edge_function audit entry naming the function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await logSupportModeAction({ rpc }, USER, ORG, "invite-team-member", { team_member_id: "tm1" });
    expect(rpc).toHaveBeenCalledWith("platform_admin_log_for", {
      p_user_id: USER,
      p_org_id: ORG,
      p_action: "edge_function",
      p_detail: { function: "invite-team-member", team_member_id: "tm1" },
    });
  });

  it("never throws when the audit log write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    await expect(logSupportModeAction({ rpc }, USER, ORG, "sync-location-quantity")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
