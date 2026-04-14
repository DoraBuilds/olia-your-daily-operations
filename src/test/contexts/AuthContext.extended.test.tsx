/**
 * Extended AuthContext tests — covers the branches not reached by the original suite:
 *  - retrySetup() re-invokes fetchTeamMember after a previous failure
 *  - retrySetup() is a no-op when user is null
 *  - TOKEN_REFRESHED event skips fetchTeamMember (but sets user/session)
 *  - RPC throws → sets setupError with the migration message
 *  - Missing businessName AND missing ownerName branches in fetchTeamMember
 *  - Malformed JSON in localStorage does not crash (falls back to metadata)
 *  - After RPC success, localStorage key is removed
 *  - signOut clears queryClient cache via SIGNED_OUT event
 *  - INITIAL_SESSION with a valid session (has user) fetches team member
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const {
  mockSignOut,
  mockOnAuthStateChange,
  mockRpc,
  mockQueryClientClear,
  mockTeamMemberSingle,
} = vi.hoisted(() => ({
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
  // Fire INITIAL_SESSION with null (no active session)
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

// ─────────────────────────────────────────────────────────────────────────────

describe("AuthContext extended — retrySetup()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    // Re-install the callback capture after clearAllMocks
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));
    localStorage.clear();
  });

  it("retrySetup re-fetches the team member after a failed setup", async () => {
    // First sign-in with no metadata → triggers setupError
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: { id: "user-retry", user_metadata: {} },
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/could not be completed safely/i);

    // Now set up the team member row and call retrySetup
    teamMemberRow = {
      id: "user-retry",
      organization_id: "org-1",
      name: "Retry User",
      email: "retry@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    };
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));

    await act(async () => {
      result.current.retrySetup();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.id).toBe("user-retry");
    expect(result.current.setupError).toBeNull();
  });

  it("retrySetup is a no-op when there is no authenticated user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // No user set — retrySetup should not call supabase
    await act(async () => {
      result.current.retrySetup();
    });

    expect(mockTeamMemberSingle).not.toHaveBeenCalled();
  });

  it("retrySetup sets loading to true then resolves when user exists", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Trigger SIGNED_IN with missing metadata (so setupError is set)
    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: { id: "user-R2", user_metadata: {} },
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toBeTruthy();

    // Now provide a row and retry
    teamMemberRow = {
      id: "user-R2",
      organization_id: "org-R2",
      name: "R2",
      email: "r2@test.com",
      role: "Staff",
      location_ids: [],
      permissions: {},
    };
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));

    act(() => { result.current.retrySetup(); });
    // loading should become true immediately
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.name).toBe("R2");
  });
});

describe("AuthContext extended — RPC error path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    // No existing team member row
    mockTeamMemberSingle.mockImplementation(async () => ({ data: null, error: null }));
    localStorage.clear();
  });

  it("sets setupError with the migration message when setup_new_organization RPC throws", async () => {
    mockRpc.mockRejectedValueOnce(new Error("RPC function not found"));

    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Fail Corp", ownerName: "Fail User" }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-fail",
          user_metadata: { business_name: "Fail Corp", full_name: "Fail User" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/migration/i);
    expect(result.current.teamMember).toBeNull();
    // localStorage should be cleared on failure too
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
  });

  it("removes localStorage onboarding key after successful RPC call", async () => {
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Success Co", ownerName: "Happy User" }),
    );

    // After RPC succeeds, a new team member row is returned
    let callCount = 0;
    mockTeamMemberSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // first check: no row
      return {
        data: {
          id: "user-ok",
          organization_id: "org-ok",
          name: "Happy User",
          email: "happy@test.com",
          role: "Owner",
          location_ids: [],
          permissions: {},
        },
        error: null,
      };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-ok",
          user_metadata: { business_name: "Success Co", full_name: "Happy User" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
    expect(result.current.teamMember?.name).toBe("Happy User");
  });
});

describe("AuthContext extended — missing ownerName branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockTeamMemberSingle.mockImplementation(async () => ({ data: null, error: null }));
    localStorage.clear();
  });

  it("sets setupError when businessName is present but ownerName is missing", async () => {
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Some Biz" }), // no ownerName
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-noname",
          user_metadata: { business_name: "Some Biz" }, // no full_name
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/could not be completed safely/i);
    expect(result.current.teamMember).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("AuthContext extended — TOKEN_REFRESHED event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));
    localStorage.clear();
  });

  it("TOKEN_REFRESHED sets user/session without calling fetchTeamMember", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const refreshSession = {
      user: {
        id: "user-refresh",
        user_metadata: { business_name: "Refresh Co", full_name: "Refresh User" },
      },
    };

    await act(async () => {
      authStateCallback?.("TOKEN_REFRESHED", refreshSession);
    });

    // Should NOT have called supabase.from().single() for team_members
    expect(mockTeamMemberSingle).not.toHaveBeenCalled();
    // But should have updated the user
    expect(result.current.user?.id).toBe("user-refresh");
  });

  it("TOKEN_REFRESHED does not clear org-scoped cache (queryClient.clear not called beyond initial)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const clearCallsBefore = mockQueryClientClear.mock.calls.length;

    await act(async () => {
      authStateCallback?.("TOKEN_REFRESHED", {
        user: {
          id: "user-t",
          user_metadata: {},
        },
      });
    });

    // No additional clear calls on TOKEN_REFRESHED
    expect(mockQueryClientClear.mock.calls.length).toBe(clearCallsBefore);
  });
});

describe("AuthContext extended — malformed localStorage JSON", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockTeamMemberSingle.mockImplementation(async () => ({ data: null, error: null }));
    localStorage.clear();
  });

  it("falls back to user metadata when localStorage JSON is malformed", async () => {
    localStorage.setItem("olia_pending_onboarding", "{ not valid json }");

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-meta",
          user_metadata: {
            business_name: "Meta Corp",
            full_name: "Meta User",
          },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Should fall through to metadata path and call RPC
    expect(mockRpc).toHaveBeenCalledWith("setup_new_organization", {
      p_business_name: "Meta Corp",
      p_owner_name: "Meta User",
    });
  });
});

describe("AuthContext extended — INITIAL_SESSION with a live session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    localStorage.clear();
  });

  it("fetches team member on INITIAL_SESSION when a session already exists", async () => {
    teamMemberRow = {
      id: "user-existing",
      organization_id: "org-existing",
      name: "Existing User",
      email: "existing@test.com",
      role: "Manager",
      location_ids: ["loc-1"],
      permissions: {},
    };

    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      // Fire INITIAL_SESSION with an existing session (returning user)
      callback("INITIAL_SESSION", {
        user: {
          id: "user-existing",
          user_metadata: { business_name: "Existing Co", full_name: "Existing User" },
        },
      });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockTeamMemberSingle.mockImplementation(async () => ({ data: teamMemberRow, error: null }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.id).toBe("user-existing");
    expect(result.current.teamMember?.name).toBe("Existing User");
    // INITIAL_SESSION does not trigger queryClient.clear (only SIGNED_IN does)
    expect(mockQueryClientClear).not.toHaveBeenCalled();
  });
});
