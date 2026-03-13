import { renderHook, waitFor } from "@testing-library/react";
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    teamMember: { id: "tm-1", organization_id: "org-1", name: "Test", email: "t@t.com", role: "Owner", location_ids: [], permissions: {} },
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
});

describe("useSaveStaffProfile", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useSaveStaffProfile(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useArchiveStaffProfile", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useArchiveStaffProfile(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useArchiveStaffProfile(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useRestoreStaffProfile", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useRestoreStaffProfile(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useRestoreStaffProfile(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useDeleteStaffProfile", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteStaffProfile(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDeleteStaffProfile(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
