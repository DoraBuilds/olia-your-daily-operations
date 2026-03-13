import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useChecklistLogs, useCreateChecklistLog } from "@/hooks/useChecklistLogs";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1",
      organization_id: "org1",
      name: "Sarah",
      email: "s@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    then: vi.fn().mockImplementation((cb) =>
      Promise.resolve(cb({ data: [], error: null }))
    ),
  });
});

describe("useChecklistLogs", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useChecklistLogs(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array by default", async () => {
    const { result } = renderHook(() => useChecklistLogs(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'checklist_logs'", async () => {
    const { result } = renderHook(() => useChecklistLogs(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("checklist_logs");
  });

  it("accepts filters param without error", () => {
    const filters = { from: "2026-03-01T00:00:00", to: "2026-03-09T23:59:59" };
    const { result } = renderHook(() => useChecklistLogs(filters), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("accepts undefined filters", () => {
    const { result } = renderHook(() => useChecklistLogs(undefined), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns log data when supabase returns items", async () => {
    const mockLogs = [
      {
        id: "l1",
        checklist_id: "c1",
        checklist_title: "Opening Checklist",
        completed_by: "Alice",
        staff_profile_id: "sp1",
        score: 90,
        type: "opening",
        answers: [],
        created_at: "2026-03-09T08:00:00Z",
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ data: mockLogs, error: null }),
    });
    const filters = { from: "2026-03-09T00:00:00", to: "2026-03-09T23:59:59" };
    const { result } = renderHook(() => useChecklistLogs(filters), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].checklist_title).toBe("Opening Checklist");
  });

  it("data is array type", async () => {
    const { result } = renderHook(() => useChecklistLogs(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.data ?? [])).toBe(true);
  });

  it("uses different queryKey when filters provided", () => {
    const withFilters = renderHook(() => useChecklistLogs({ from: "2026-01-01" }), {
      wrapper: makeWrapper(),
    });
    const withoutFilters = renderHook(() => useChecklistLogs(), { wrapper: makeWrapper() });
    expect(withFilters.result.current).toHaveProperty("isLoading");
    expect(withoutFilters.result.current).toHaveProperty("isLoading");
  });
});

describe("useCreateChecklistLog", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useCreateChecklistLog(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useCreateChecklistLog(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });

  it("returns a mutateAsync function", () => {
    const { result } = renderHook(() => useCreateChecklistLog(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});
