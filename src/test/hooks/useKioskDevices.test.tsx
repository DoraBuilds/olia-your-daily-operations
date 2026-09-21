import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useKioskDevices, useRevokeKioskDevice } from "@/hooks/useKioskDevices";

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
