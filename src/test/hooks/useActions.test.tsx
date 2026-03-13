import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useActions,
  useUpdateActionStatus,
  useSaveAction,
  useDeleteAction,
} from "@/hooks/useActions";

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
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb) =>
      Promise.resolve(cb({ data: [], error: null }))
    ),
  });
});

describe("useActions", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useActions(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useActions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'actions'", async () => {
    const { result } = renderHook(() => useActions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("actions");
  });

  it("returns action data when supabase returns items", async () => {
    const mockActions = [
      {
        id: "a1",
        checklist_id: "cl1",
        checklist_title: "Opening Checklist",
        title: "Fix fridge seal",
        assigned_to: "Marc",
        due: "Today",
        status: "open" as const,
        created_at: "2026-03-09T08:00:00Z",
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockActions, error: null }),
    });
    const { result } = renderHook(() => useActions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe("Fix fridge seal");
  });

  it("data is an array", async () => {
    const { result } = renderHook(() => useActions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.data ?? [])).toBe(true);
  });
});

describe("useUpdateActionStatus", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useUpdateActionStatus(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useUpdateActionStatus(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useSaveAction", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveAction(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useSaveAction(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });

  it("returns a mutateAsync function", () => {
    const { result } = renderHook(() => useSaveAction(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});

describe("useDeleteAction", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteAction(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDeleteAction(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
