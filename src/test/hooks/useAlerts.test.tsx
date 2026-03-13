import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useAlerts, useCreateAlert, useDismissAlert, useClearAlerts } from "@/hooks/useAlerts";

const mockFrom = vi.fn();

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
  useAuth: () => ({
    teamMember: {
      id: "tm-1",
      organization_id: "org-1",
      name: "Test User",
      email: "t@t.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    user: { id: "tm-1" },
    loading: false,
  }),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  });
});

describe("useAlerts", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'alerts'", async () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("alerts");
  });

  it("returns data as an array", async () => {
    const mockAlerts = [
      {
        id: "a-1",
        type: "warn",
        message: "Test alert",
        area: "Kitchen",
        time: "09:00",
        source: "checklist",
        dismissed_at: null,
        created_at: "2026-03-09T09:00:00Z",
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockAlerts, error: null }),
    });

    const { result } = renderHook(() => useAlerts(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].message).toBe("Test alert");
  });
});

describe("useCreateAlert", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useCreateAlert(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useCreateAlert(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useDismissAlert", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDismissAlert(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDismissAlert(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useClearAlerts", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useClearAlerts(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useClearAlerts(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
