import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { usePlan } from "@/hooks/usePlan";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("usePlan", () => {
  it("returns plan='starter' when no org data (no teamMember)", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("starter");
  });

  it("can('aiBuilder') returns false on starter plan", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.can("aiBuilder")).toBe(false);
  });

  it("can('exportPdf') returns true on starter plan", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.can("exportPdf")).toBe(true);
  });

  it("withinLimit('maxLocations', 0) returns true on starter", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.withinLimit("maxLocations", 0)).toBe(true);
  });

  it("withinLimit('maxLocations', 1) returns false on starter (limit is 1, meaning 0 < 1)", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // starter maxLocations = 1, so count < 1 means 0 is within limit, 1 is not
    expect(result.current.withinLimit("maxLocations", 1)).toBe(false);
  });

  it("isActive is true by default (starter has no planStatus set so defaults to 'active')", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isActive).toBe(true);
  });

  it("hasStripeSubscription is false when no org data", async () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasStripeSubscription).toBe(false);
  });
});
