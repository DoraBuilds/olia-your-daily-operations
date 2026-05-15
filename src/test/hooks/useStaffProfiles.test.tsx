import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useStaffProfiles,
  useSaveStaffProfile,
  useArchiveStaffProfile,
  useRestoreStaffProfile,
  useDeleteStaffProfile,
} from "@/hooks/useStaffProfiles";

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

let mockTeamMember: Record<string, unknown> | null = {
  id: "tm-1",
  organization_id: "org-1",
  name: "Test",
  email: "t@t.com",
  role: "Owner",
  location_ids: [],
  permissions: {},
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    teamMember: mockTeamMember,
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
  mockTeamMember = {
    id: "tm-1",
    organization_id: "org-1",
    name: "Test",
    email: "t@t.com",
    role: "Owner",
    location_ids: [],
    permissions: {},
  };
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  });
});

describe("useStaffProfiles", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useStaffProfiles(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useStaffProfiles(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'staff_profiles'", async () => {
    const { result } = renderHook(() => useStaffProfiles(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("staff_profiles");
  });

  it("returns profile data when Supabase returns rows", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "sp-1", location_id: "loc-1", first_name: "Ada", last_name: "Lovelace", role: "Chef", status: "active", email: null, last_used_at: null, archived_at: null, created_at: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      }),
    });

    const { result } = renderHook(() => useStaffProfiles(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].first_name).toBe("Ada");
  });

  it("does not expose a pin field on returned profiles", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: "sp-1", location_id: null, first_name: "Bob", last_name: "Smith", role: "Waiter", status: "active", email: null, last_used_at: null, archived_at: null, created_at: "2026-01-01T00:00:00Z" }],
        error: null,
      }),
    });

    const { result } = renderHook(() => useStaffProfiles(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.[0]).not.toHaveProperty("pin");
  });
});

describe("useSaveStaffProfile — INSERT (new profile)", () => {
  it("inserts a new profile and hashes the raw PIN before storage", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: insertFn,
    });

    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        first_name: "Ada",
        last_name: "Lovelace",
        role: "Chef",
        status: "active",
        rawPin: "1234",
      } as any);
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0][0];
    // Pin must be stored hashed, not as the raw "1234"
    expect(payload.pin).toBeTruthy();
    expect(payload.pin).not.toBe("1234");
    expect(payload.organization_id).toBe("org-1");
    expect(result.current.isError).toBe(false);
  });

  it("throws when rawPin is missing for a new profile", async () => {
    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          first_name: "No",
          last_name: "Pin",
          role: "Waiter",
          status: "active",
        } as any);
      }),
    ).rejects.toThrow(/PIN is required/i);
  });

  it("throws the !teamMember guard error when auth is not ready", async () => {
    mockTeamMember = null;
    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ first_name: "X", last_name: "Y", role: "Waiter", rawPin: "1234" } as any);
      }),
    ).rejects.toThrow(/account setup is not complete/i);
  });
});

describe("useSaveStaffProfile — UPDATE (existing profile)", () => {
  it("updates an existing profile without touching the PIN when rawPin is absent", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "sp-1" }], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        id: "sp-1",
        first_name: "Ada",
        last_name: "Updated",
        role: "Chef",
        status: "active",
      } as any);
    });

    const payload = updateFn.mock.calls[0][0];
    expect(payload).not.toHaveProperty("pin");
    expect(payload.first_name).toBe("Ada");
    expect(result.current.isError).toBe(false);
  });

  it("hashes and updates the PIN when rawPin is supplied for an existing profile", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "sp-1" }], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        id: "sp-1",
        first_name: "Ada",
        last_name: "Lovelace",
        role: "Chef",
        status: "active",
        rawPin: "9999",
      } as any);
    });

    const payload = updateFn.mock.calls[0][0];
    expect(payload.pin).toBeTruthy();
    expect(payload.pin).not.toBe("9999");
  });

  it("throws when update affects 0 rows (RLS blocked)", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          id: "sp-blocked",
          first_name: "X",
          last_name: "Y",
          role: "Waiter",
          status: "active",
        } as any);
      }),
    ).rejects.toThrow(/Profile update failed/i);
  });
});

describe("useArchiveStaffProfile", () => {
  it("archives a profile and resolves without error", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "sp-1" }], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useArchiveStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync("sp-1");
    });

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
    expect(result.current.isError).toBe(false);
  });

  it("throws when archive affects 0 rows", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useArchiveStaffProfile(), { wrapper: makeWrapper() });

    await expect(
      act(async () => { await result.current.mutateAsync("sp-blocked"); }),
    ).rejects.toThrow(/Could not archive/i);
  });
});

describe("useRestoreStaffProfile", () => {
  it("restores a profile and resolves without error", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "sp-1" }], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useRestoreStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync("sp-1");
    });

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", archived_at: null }),
    );
    expect(result.current.isError).toBe(false);
  });

  it("throws when restore affects 0 rows", async () => {
    const selectFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqFn = vi.fn().mockReturnValue({ select: selectFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
    });

    const { result } = renderHook(() => useRestoreStaffProfile(), { wrapper: makeWrapper() });

    await expect(
      act(async () => { await result.current.mutateAsync("sp-blocked"); }),
    ).rejects.toThrow(/Could not restore/i);
  });
});

describe("useDeleteStaffProfile", () => {
  it("calls supabase DELETE and resolves without error", async () => {
    const eqFn = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });

    const { result } = renderHook(() => useDeleteStaffProfile(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync("sp-1");
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);
  });
});
