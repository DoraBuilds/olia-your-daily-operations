import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTeamMembers, useSaveTeamMember, useSaveAdminPin, useDeleteTeamMember } from "@/hooks/useTeamMembers";

const mockFrom = vi.fn();
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: any[]) => mockFrom(...args),
    rpc: mockRpc,
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
  mockRpc.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
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
            organization_id: "org-1",
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

  it("sends the raw PIN to the server when saving team members (server bcrypt-hashes it)", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "tm-2" }], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update,
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
    });

    const { result } = renderHook(() => useSaveTeamMember(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        id: "tm-2",
        name: "Test User",
        email: "test@example.com",
        role: "Owner",
        location_ids: [],
        permissions: {},
        rawPin: "1234",
      } as any);
    });

    // The client sends the raw PIN; a Postgres BEFORE INSERT/UPDATE trigger
    // (trg_hash_team_member_pin) bcrypt-hashes it before storage.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        pin: "1234",
        pin_reset_required: false,
      }),
    );
  });

  it("marks a newly created owner PIN as needing a reset", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn() }),
      insert,
      delete: vi.fn().mockReturnThis(),
    });

    const { result } = renderHook(() => useSaveTeamMember(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        name: "Test Owner",
        email: "owner@example.com",
        role: "Owner",
        location_ids: [],
        permissions: {},
        rawPin: "1234",
      } as any);
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      pin_reset_required: true,
    }));
  });

  it("fails loudly when an existing team member update affects no rows", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update,
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
    });

    const { result } = renderHook(() => useSaveTeamMember(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync({
      id: "tm-2",
      name: "Test User",
      email: "test@example.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    } as any)).rejects.toThrow(/Account update failed/i);
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

describe("useSaveAdminPin", () => {
  it("calls supabase.rpc set_admin_pin with the supplied member id and raw PIN", async () => {
    const { result } = renderHook(() => useSaveAdminPin(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ memberId: "tm-2", rawPin: "5678" });
    });

    expect(mockRpc).toHaveBeenCalledWith("set_admin_pin", {
      p_member_id: "tm-2",
      p_raw_pin: "5678",
    });
    expect(result.current.isError).toBe(false);
  });

  it("throws a user-friendly error when the RPC returns an error", async () => {
    mockRpc.mockResolvedValue({ error: { message: "Another team member is already using this PIN" } });
    const { result } = renderHook(() => useSaveAdminPin(), { wrapper: makeWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ memberId: "tm-2", rawPin: "5678" });
      }),
    ).rejects.toThrow(/Another team member is already using this PIN/i);
  });

  it("invalidates team_members cache after a successful PIN update", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveAdminPin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ memberId: "tm-2", rawPin: "5678" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["team_members"] }),
    );
  });
});
