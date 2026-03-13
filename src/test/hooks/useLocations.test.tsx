import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";

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
