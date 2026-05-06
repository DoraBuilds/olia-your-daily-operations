import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";

const mockFrom = vi.fn();
const mockUsePlan = vi.fn();

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    teamMember: { id: "tm-1", organization_id: "org-1", name: "Test", email: "t@t.com", role: "Owner", location_ids: [], permissions: {} },
    user: { id: "tm-1" },
    loading: false,
  });
  mockUsePlan.mockReturnValue({
    features: { maxLocations: 10, maxStaff: 200, maxChecklists: -1, aiBuilder: true, fileConvert: true, advancedReporting: true, exportPdf: true, exportCsv: true, multiLocation: true, prioritySupport: false },
    org: { location_grace_period_ends_at: null, active_location_ids: [] },
  });
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
  });
});

describe("useLocations", () => {
  it("returns isLoading state initially", () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    // Hook starts with some loading state
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'locations'", async () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("locations");
  });

  it("keeps all locations active while the grace period is still running", async () => {
    mockUsePlan.mockReturnValue({
      features: { maxLocations: 1, maxStaff: 15, maxChecklists: 10, aiBuilder: false, fileConvert: false, advancedReporting: false, exportPdf: true, exportCsv: false, multiLocation: false, prioritySupport: false },
      org: {
        location_grace_period_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        active_location_ids: [],
      },
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "l1", organization_id: "org-1", name: "A", created_at: "2026-04-01T10:00:00Z" },
          { id: "l2", organization_id: "org-1", name: "B", created_at: "2026-04-02T10:00:00Z" },
        ],
        error: null,
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.map((location) => location.id)).toEqual(["l1", "l2"]);
    expect(result.current.inactiveLocations).toEqual([]);
    expect(result.current.isGraceActive).toBe(true);
  });

  it("filters to the saved active locations after the grace period expires", async () => {
    mockUsePlan.mockReturnValue({
      features: { maxLocations: 1, maxStaff: 15, maxChecklists: 10, aiBuilder: false, fileConvert: false, advancedReporting: false, exportPdf: true, exportCsv: false, multiLocation: false, prioritySupport: false },
      org: {
        location_grace_period_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        active_location_ids: ["l2"],
      },
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "l1", organization_id: "org-1", name: "A", created_at: "2026-04-01T10:00:00Z" },
          { id: "l2", organization_id: "org-1", name: "B", created_at: "2026-04-02T10:00:00Z" },
        ],
        error: null,
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.map((location) => location.id)).toEqual(["l2"]);
    expect(result.current.inactiveLocations.map((location) => location.id)).toEqual(["l1"]);
    expect(result.current.isGraceExpired).toBe(true);
  });
});

describe("useSaveLocation", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveLocation(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not loading by default", () => {
    const { result } = renderHook(() => useSaveLocation(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });

  it("falls back to a live DB lookup when teamMember is null in React state", async () => {
    // Simulate the race condition: user is authenticated but teamMember has not
    // yet been populated in context (transient null during auth events).
    mockUseAuth.mockReturnValue({
      teamMember: null,
      user: { id: "tm-1" },
      loading: false,
    });

    const insert = vi.fn().mockResolvedValue({ error: null });
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        // The fallback lookup — returns the row
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "tm-1", organization_id: "org-1", role: "Owner", permissions: {}, location_ids: [] },
            error: null,
          }),
        };
      }
      // locations INSERT
      callCount += 1;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert,
      };
    });

    const { result } = renderHook(() => useSaveLocation(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ name: "HQ", address: null, contact_email: null, contact_phone: null, trading_hours: null, archive_threshold_days: 90, lat: null, lng: null, place_id: null } as any);

    // The fallback correctly resolved the org and the INSERT was called with it
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1" }),
    );
  });
});

describe("useDeleteLocation", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteLocation(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not loading by default", () => {
    const { result } = renderHook(() => useDeleteLocation(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
