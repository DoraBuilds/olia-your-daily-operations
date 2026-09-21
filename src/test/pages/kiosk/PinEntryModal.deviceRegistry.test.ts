import { ensureKioskDevice, touchKioskDevice } from "@/pages/kiosk/PinEntryModal";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  localStorage.clear();
  mockRpc.mockReset();
});

describe("ensureKioskDevice", () => {
  it("registers a device and stores its id/token when none is stored yet", async () => {
    mockRpc.mockResolvedValue({ data: [{ device_id: "d1", device_token: "t1" }], error: null });
    await ensureKioskDevice("loc-1", "Host stand");
    expect(mockRpc).toHaveBeenCalledWith("register_kiosk_device", { p_location_id: "loc-1", p_label: "Host stand" });
    expect(localStorage.getItem("kiosk_device_id")).toBe("d1");
    expect(localStorage.getItem("kiosk_device_token")).toBe("t1");
  });

  it("is a no-op once a device token is already stored", async () => {
    localStorage.setItem("kiosk_device_token", "existing-token");
    await ensureKioskDevice("loc-1", "Host stand");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not throw when the rpc fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(ensureKioskDevice("loc-1")).resolves.toBeUndefined();
    expect(localStorage.getItem("kiosk_device_token")).toBeNull();
  });
});

describe("touchKioskDevice", () => {
  it("returns true when no device is registered", async () => {
    await expect(touchKioskDevice()).resolves.toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns true while the device is still active", async () => {
    localStorage.setItem("kiosk_device_token", "t1");
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(touchKioskDevice()).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("touch_kiosk_device", { p_device_token: "t1" });
  });

  it("returns false only when the server reports the device was revoked", async () => {
    localStorage.setItem("kiosk_device_token", "t1");
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(touchKioskDevice()).resolves.toBe(false);
  });

  it("treats a network error as still active", async () => {
    localStorage.setItem("kiosk_device_token", "t1");
    mockRpc.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(touchKioskDevice()).resolves.toBe(true);
  });
});
