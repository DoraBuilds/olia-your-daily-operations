import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTeamMembers, useSaveTeamMember, useDeleteTeamMember } from "@/hooks/useTeamMembers";

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
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
  });
});

describe("useTeamMembers", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useTeamMembers(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useTeamMembers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'team_members'", async () => {
    const { result } = renderHook(() => useTeamMembers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("team_members");
  });

  it("maps data and adds initials", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "tm-2",
            name: "John Doe",
            email: "john@test.com",
            role: "Manager",
            location_ids: ["loc-1"],
            permissions: null,
          },
        ],
        error: null,
      }),
    });

    const { result } = renderHook(() => useTeamMembers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].initials).toBe("JD");
  });
});

describe("useSaveTeamMember", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveTeamMember(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useSaveTeamMember(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useDeleteTeamMember", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteTeamMember(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDeleteTeamMember(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
