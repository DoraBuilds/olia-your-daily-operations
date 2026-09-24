import { touchKioskDevice } from "@/pages/kiosk/PinEntryModal";

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
