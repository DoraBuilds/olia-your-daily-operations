import {
  normalizePairingCode, formatPairingCode, pairKioskDevice, kioskAdminLogin,
} from "@/lib/kiosk-pairing";
import { readKioskAdminSession } from "@/lib/kiosk-admin-session";

const mockRpc = vi.fn();
const mockInvoke = vi.fn();
const mockSetSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    auth: { setSession: (...args: any[]) => mockSetSession(...args) },
  },
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockRpc.mockReset();
  mockInvoke.mockReset();
  mockSetSession.mockReset();
});

describe("pairing code formatting", () => {
  it("uppercases, strips separators and look-alike characters, and caps at 8", () => {
    expect(normalizePairingCode("abcd-2345")).toBe("ABCD2345");
    expect(normalizePairingCode(" ab cd 23 45 99 ")).toBe("ABCD2345");
    // 0, 1, I, L, O are never issued
    expect(normalizePairingCode("O0I1L")).toBe("");
  });

  it("shows codes as XXXX-XXXX, formatting partial input as far as it goes", () => {
    expect(formatPairingCode("ABCD2345")).toBe("ABCD-2345");
    expect(formatPairingCode("abc")).toBe("ABC");
    expect(formatPairingCode("ABCD2")).toBe("ABCD-2");
  });
});

describe("pairKioskDevice", () => {
  it("redeems the code and stores this browser's kiosk identity", async () => {
    localStorage.setItem("kiosk_owner_user_id", "old-owner");
    mockRpc.mockResolvedValue({
      data: [{ device_id: "d1", device_token: "t1", device_label: "Bar", location_id: "l1", location_name: "Downtown", kiosk_token: "k1" }],
      error: null,
    });

    const result = await pairKioskDevice("abcd-2345");

    expect(mockRpc).toHaveBeenCalledWith("pair_kiosk_device", { p_code: "ABCD2345" });
    expect(result).toEqual({ ok: true, locationId: "l1", locationName: "Downtown" });
    expect(localStorage.getItem("kiosk_location_id")).toBe("l1");
    expect(localStorage.getItem("kiosk_location_name")).toBe("Downtown");
    expect(localStorage.getItem("kiosk_token")).toBe("k1");
    expect(localStorage.getItem("kiosk_device_id")).toBe("d1");
    expect(localStorage.getItem("kiosk_device_token")).toBe("t1");
    expect(localStorage.getItem("kiosk_device_location_id")).toBe("l1");
    expect(localStorage.getItem("kiosk_owner_user_id")).toBeNull();
  });

  it("reports an unknown or already-used code without touching local state", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(pairKioskDevice("ABCD2345")).resolves.toEqual({ ok: false, reason: "invalid_code" });
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
  });

  it("reports a request failure separately from a bad code", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    await expect(pairKioskDevice("ABCD2345")).resolves.toEqual({ ok: false, reason: "network" });
  });
});

describe("kioskAdminLogin", () => {
  beforeEach(() => {
    localStorage.setItem("kiosk_location_id", "l1");
    localStorage.setItem("kiosk_device_token", "t1");
  });

  it("does nothing on a browser that isn't a paired kiosk", async () => {
    localStorage.removeItem("kiosk_device_token");
    await expect(kioskAdminLogin("1234", "l1")).resolves.toEqual({ ok: false, reason: "not_paired" });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("exchanges device token + PIN for a session, granting kiosk admin access first", async () => {
    mockInvoke.mockResolvedValue({
      data: { access_token: "a", refresh_token: "r", team_member_id: "owner-1", location_id: "l1" },
      error: null,
    });
    // The grant must already exist when the session lands — Kiosk.tsx signs
    // out any session it sees without one.
    let grantAtSetSession: unknown = null;
    mockSetSession.mockImplementation(async () => {
      grantAtSetSession = readKioskAdminSession();
      return { error: null };
    });

    const result = await kioskAdminLogin("1234", "l1");

    expect(mockInvoke).toHaveBeenCalledWith("kiosk-admin-login", { body: { device_token: "t1", pin: "1234" } });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    expect(grantAtSetSession).toMatchObject({ userId: "owner-1", locationId: "l1" });
    expect(result).toEqual({ ok: true, teamMemberId: "owner-1" });
  });

  it.each(["invalid_pin", "rate_limited", "device_inactive"])("passes through %s", async (reason) => {
    mockInvoke.mockResolvedValue({ data: { error: reason }, error: null });
    await expect(kioskAdminLogin("1234", "l1")).resolves.toEqual({ ok: false, reason });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("maps unexpected server errors to a generic error", async () => {
    mockInvoke.mockResolvedValue({ data: { error: "server_error" }, error: null });
    await expect(kioskAdminLogin("1234", "l1")).resolves.toEqual({ ok: false, reason: "error" });
    mockInvoke.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(kioskAdminLogin("1234", "l1")).resolves.toEqual({ ok: false, reason: "error" });
  });

  it("withdraws the admin grant if the session can't be set", async () => {
    mockInvoke.mockResolvedValue({
      data: { access_token: "a", refresh_token: "r", team_member_id: "owner-1", location_id: "l1" },
      error: null,
    });
    mockSetSession.mockResolvedValue({ error: { message: "bad token" } });
    await expect(kioskAdminLogin("1234", "l1")).resolves.toEqual({ ok: false, reason: "error" });
    expect(readKioskAdminSession()).toBeNull();
  });
});
