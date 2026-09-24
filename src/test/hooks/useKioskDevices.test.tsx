import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useKioskDevices, useRevokeKioskDevice, useCreateKioskDevice, useRegenerateKioskCode } from "@/hooks/useKioskDevices";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockUseAuth.mockReturnValue({
    teamMember: { id: "tm-1", organization_id: "org-1" },
  });
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
});

describe("useKioskDevices", () => {
  it("queries kiosk_devices scoped to non-revoked rows", async () => {
    const { result } = renderHook(() => useKioskDevices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("kiosk_devices");
    expect(result.current.data).toEqual([]);
  });

  it("does not query when there is no organization yet", () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => useKioskDevices(), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("surfaces devices returned by supabase", async () => {
    const device = {
      id: "d1", organization_id: "org-1", location_id: "loc-1",
      label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z",
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [device], error: null }),
    });
    const { result } = renderHook(() => useKioskDevices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([device]);
  });
});

describe("useRevokeKioskDevice", () => {
  it("calls revoke_kiosk_device with the device id", async () => {
    mockRpc.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useRevokeKioskDevice(), { wrapper: makeWrapper() });
    result.current.mutate("d1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("revoke_kiosk_device", { p_device_id: "d1" });
  });

  it("surfaces an error when the rpc fails", async () => {
    mockRpc.mockResolvedValue({ error: { message: "not found" } });
    const { result } = renderHook(() => useRevokeKioskDevice(), { wrapper: makeWrapper() });
    result.current.mutate("d1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateKioskDevice", () => {
  it("creates a kiosk for the location and returns its code", async () => {
    mockRpc.mockResolvedValue({ data: [{ device_id: "d1", label: "Bar", pairing_code: "ABCD2345" }], error: null });
    const { result } = renderHook(() => useCreateKioskDevice(), { wrapper: makeWrapper() });
    const row = await result.current.mutateAsync({ locationId: "loc-1", label: "Bar" });
    expect(mockRpc).toHaveBeenCalledWith("create_kiosk_device", { p_location_id: "loc-1", p_label: "Bar" });
    expect(row).toEqual({ device_id: "d1", label: "Bar", pairing_code: "ABCD2345" });
  });

  it("rejects when the rpc errors or returns nothing", async () => {
    const { result } = renderHook(() => useCreateKioskDevice(), { wrapper: makeWrapper() });
    mockRpc.mockResolvedValue({ data: null, error: new Error("only the account owner can add kiosks") });
    await expect(result.current.mutateAsync({ locationId: "loc-1", label: "Bar" })).rejects.toThrow("only the account owner");
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(result.current.mutateAsync({ locationId: "loc-1", label: "Bar" })).rejects.toThrow("No device returned");
  });
});

describe("useRegenerateKioskCode", () => {
  it("issues a new code for the device", async () => {
    mockRpc.mockResolvedValue({ data: "WXYZ6789", error: null });
    const { result } = renderHook(() => useRegenerateKioskCode(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync("d1")).resolves.toBe("WXYZ6789");
    expect(mockRpc).toHaveBeenCalledWith("regenerate_kiosk_pairing_code", { p_device_id: "d1" });
  });

  it("rejects when the rpc fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("nope") });
    const { result } = renderHook(() => useRegenerateKioskCode(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync("d1")).rejects.toThrow("nope");
  });
});
