import { startKioskPreview, endKioskPreview, recoverAbandonedKioskPreview, isKioskPreviewActive } from "@/lib/kiosk-preview";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: any[]) => mockRpc(...a) } }));

const row = { device_label: "Bar", location_id: "l1", location_name: "Downtown", kiosk_token: "k1" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: [row], error: null });
});

describe("kiosk test mode", () => {
  it("shows the location without storing any device identity", async () => {
    expect(await startKioskPreview("d1")).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("preview_kiosk_device", { p_device_id: "d1" });
    expect(localStorage.getItem("kiosk_location_id")).toBe("l1");
    expect(localStorage.getItem("kiosk_device_token")).toBeNull();
    expect(localStorage.getItem("kiosk_device_id")).toBeNull();
    expect(isKioskPreviewActive()).toBe(true);
  });

  it("leaves the browser untouched when the RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(await startKioskPreview("d1")).toEqual({ ok: false });
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
  });

  it("exiting makes the browser a plain browser again", async () => {
    await startKioskPreview("d1");
    endKioskPreview();
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
    expect(localStorage.getItem("kiosk_token")).toBeNull();
    expect(isKioskPreviewActive()).toBe(false);
  });

  it("restores the real kiosk identity a browser already had", async () => {
    localStorage.setItem("kiosk_location_id", "real");
    localStorage.setItem("kiosk_device_token", "tok");
    await startKioskPreview("d1");
    expect(localStorage.getItem("kiosk_device_token")).toBeNull();
    endKioskPreview();
    expect(localStorage.getItem("kiosk_location_id")).toBe("real");
    expect(localStorage.getItem("kiosk_device_token")).toBe("tok");
  });

  it("undoes an abandoned test on the next load (tab closed mid-test)", async () => {
    await startKioskPreview("d1");
    sessionStorage.clear(); // new tab/session
    recoverAbandonedKioskPreview();
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
  });

  it("keeps a test alive across a reload in the same tab", async () => {
    await startKioskPreview("d1");
    recoverAbandonedKioskPreview();
    expect(localStorage.getItem("kiosk_location_id")).toBe("l1");
  });
});
