import {
  isBlockedInSupportMode,
  setSupportModeActive,
  supportModeFetch,
  SUPPORT_MODE_BLOCKED_MESSAGE,
} from "@/lib/support-mode";

const FN_URL = "https://abc.supabase.co/functions/v1";

describe("support-mode fetch guard", () => {
  const realFetch = globalThis.fetch;
  const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    setSupportModeActive(false);
  });

  it("passes everything through when support mode is off", async () => {
    await supportModeFetch(`${FN_URL}/delete-my-account`, { method: "POST" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(isBlockedInSupportMode("delete-my-account")).toBe(false);
  });

  it.each([
    "delete-my-account",
    "manage-subscription",
    "create-checkout-session",
    "confirm-checkout-session",
    "sync-location-quantity",
    "invite-team-member",
    "check-checklist-alerts",
  ])("refuses %s in support mode without hitting the network", async (name) => {
    setSupportModeActive(true);
    const res = await supportModeFetch(`${FN_URL}/${name}`, { method: "POST" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: SUPPORT_MODE_BLOCKED_MESSAGE });
  });

  it("matches Request and URL inputs, and ignores query strings", async () => {
    setSupportModeActive(true);
    expect((await supportModeFetch(new Request(`${FN_URL}/manage-subscription`))).status).toBe(403);
    expect((await supportModeFetch(new URL(`${FN_URL}/invite-team-member?x=1`))).status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("still allows functions that don't act on the caller's own org, and REST calls", async () => {
    setSupportModeActive(true);
    await supportModeFetch(`${FN_URL}/generate-training`);
    await supportModeFetch("https://abc.supabase.co/rest/v1/checklists?select=*");
    await supportModeFetch("https://abc.supabase.co/rest/v1/rpc/delete_my_account");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
