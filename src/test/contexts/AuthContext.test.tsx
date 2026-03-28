import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const { mockSignOut, mockOnAuthStateChange, mockRpc, mockQueryClientClear, mockTeamMemberSingle } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockOnAuthStateChange: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  mockQueryClientClear: vi.fn(),
  mockTeamMemberSingle: vi.fn(),
}));

let authStateCallback: ((event: string, session: any) => void) | null = null;
let teamMemberRow: Record<string, unknown> | null = null;

mockOnAuthStateChange.mockImplementation((callback) => {
  authStateCallback = callback;
  callback("INITIAL_SESSION", null);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockTeamMemberSingle,
    }),
    rpc: mockRpc,
  },
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: {
    clear: mockQueryClientClear,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));
  });

  it("useAuth returns null user and null session when no session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.teamMember).toBeNull();
  });

  it("AuthProvider renders children without crashing", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current).toBeDefined();
  });

  it("signOut function is callable", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("loading is initially true or transitions to false", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it("useAuth returns a signOut function", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.signOut).toBe("function");
  });

  it("clears org-scoped cache when auth switches accounts", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          user_metadata: {
            business_name: "Acme Café",
            full_name: "Sarah Johnson",
            email: "sarah@acme.com",
          },
        },
      });
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(2);

    await act(async () => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(3);
    expect(result.current.teamMember).toBeNull();
  });

  it("fails closed when onboarding data is missing instead of creating an org from fallback data", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          user_metadata: {},
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/could not be completed safely/i);
    expect(result.current.teamMember).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("uses stored onboarding data when creating the org for a fresh sign-in", async () => {
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Acme Café", ownerName: "Sarah Johnson" }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          user_metadata: {
            business_name: "Acme Café",
            full_name: "Sarah Johnson",
          },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnAuthStateChange).toHaveBeenCalled();
    expect(result.current.setupError).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith(
      "setup_new_organization",
      {
        p_business_name: "Acme Café",
        p_owner_name: "Sarah Johnson",
      },
    );
  });

  it("reuses an existing team member row instead of creating a new org", async () => {
    teamMemberRow = {
      id: "user-1",
      organization_id: "org-1",
      name: "Sarah Johnson",
      email: "sarah@acme.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    };

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          user_metadata: {
            business_name: "Acme Café",
            full_name: "Sarah Johnson",
            email: "sarah@acme.com",
          },
        },
      });
    });

    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("org-1"));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockQueryClientClear).toHaveBeenCalledTimes(2);
  });

  it("does not recreate onboarding setup on token refresh", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("TOKEN_REFRESHED", {
        user: {
          id: "user-1",
          user_metadata: {
            business_name: "Acme Café",
            full_name: "Sarah Johnson",
            email: "sarah@acme.com",
          },
        },
      });
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
  });
});
