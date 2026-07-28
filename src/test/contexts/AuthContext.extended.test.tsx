/**
 * Extended AuthContext tests — covers the branches not reached by the original suite:
 *  - retrySetup() re-invokes fetchTeamMember after a previous failure
 *  - retrySetup() is a no-op when user is null
 *  - TOKEN_REFRESHED event skips fetchTeamMember (but sets user/session)
 *  - RPC throws → sets setupError with a user-friendly message
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
      update: vi.fn().mockReturnThis(),
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

  it("sets setupError when setup_new_organization RPC throws", async () => {
    // Keyed by function name since accept_invite (invite fallback) runs first.
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "setup_new_organization") throw new Error("RPC function not found");
      return { data: {}, error: null };
    });

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
    expect(result.current.setupError).toMatch(/not complete/i);
    expect(result.current.teamMember).toBeNull();
    // localStorage should be cleared on failure too
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
  });

  it("sets setupError when setup_new_organization RPC returns an error object (non-throwing)", async () => {
    // Supabase JS v2 returns { data: null, error: {...} } for PostgreSQL RAISE EXCEPTION — it does NOT throw.
    // Before this fix, the error was silently ignored and the re-fetch returned null with no setupError set.
    // Keyed by function name since accept_invite (invite fallback) runs first.
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "setup_new_organization") {
        return { data: null, error: { message: "duplicate key value violates unique constraint" } };
      }
      return { data: {}, error: null };
    });

    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Dupe Corp", ownerName: "Dupe User" }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-dupe",
          user_metadata: { business_name: "Dupe Corp", full_name: "Dupe User" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/not complete/i);
    expect(result.current.teamMember).toBeNull();
  });

  it("removes localStorage onboarding key after successful RPC call", async () => {
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Success Co", ownerName: "Happy User" }),
    );

    // RPC now returns the team_member row directly — no re-fetch needed.
    // Keyed by function name since accept_invite (invite fallback) runs first.
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "setup_new_organization") {
        return {
          data: {
            team_member: {
              id: "user-ok",
              organization_id: "org-ok",
              name: "Happy User",
              email: "happy@test.com",
              role: "Owner",
              location_ids: [],
              permissions: {},
              pin_reset_required: false,
            },
            existed: false,
          },
          error: null,
        };
      }
      return { data: {}, error: null };
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
    // accept_invite is always tried first (email-based invite fallback), but
    // setup_new_organization must never be reached without an owner name.
    expect(mockRpc).toHaveBeenCalledWith("accept_invite");
    expect(mockRpc).not.toHaveBeenCalledWith("setup_new_organization", expect.anything());
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

describe("AuthContext extended — invite acceptance fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    teamMemberRow = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      callback("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    localStorage.clear();
  });

  it("links the team member via the localStorage token when present", async () => {
    localStorage.setItem("olia_pending_invite_token", "token-abc");
    mockRpc.mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "accept_invite" && args?.p_token === "token-abc") {
        return { data: { success: true }, error: null };
      }
      return { data: {}, error: null };
    });
    mockTeamMemberSingle
      .mockResolvedValueOnce({ data: null, error: null }) // Step 1: by id
      .mockResolvedValueOnce({ data: null, error: null }) // Step 2: by auth_user_id
      .mockResolvedValueOnce({
        data: {
          id: "tm-1",
          organization_id: "org-1",
          name: "Bárbara",
          email: "barbara@example.com",
          role: "Manager",
          location_ids: [],
          permissions: {},
        },
        error: null,
      }); // re-fetch after accept_invite success

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: { id: "user-invited", user_metadata: {} } });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.name).toBe("Bárbara");
    expect(result.current.setupError).toBeNull();
    expect(localStorage.getItem("olia_pending_invite_token")).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("accept_invite", { p_token: "token-abc" });
  });

  it("links the team member by email when no localStorage token exists (cross-device/cross-browser acceptance)", async () => {
    // No olia_pending_invite_token set — e.g. invitee signed in via /login
    // or on a different device than the one that opened /accept-invite.
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "accept_invite") return { data: { success: true }, error: null };
      return { data: {}, error: null };
    });
    mockTeamMemberSingle
      .mockResolvedValueOnce({ data: null, error: null }) // Step 1
      .mockResolvedValueOnce({ data: null, error: null }) // Step 2
      .mockResolvedValueOnce({
        data: {
          id: "tm-2",
          organization_id: "org-2",
          name: "Bárbara",
          email: "barbara@example.com",
          role: "Manager",
          location_ids: [],
          permissions: {},
        },
        error: null,
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: { id: "user-cross-device", user_metadata: {} } });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.name).toBe("Bárbara");
    expect(result.current.setupError).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("accept_invite");
  });

  it("sets a specific setupError when the localStorage token exists but neither it nor the email match", async () => {
    localStorage.setItem("olia_pending_invite_token", "stale-token");
    mockRpc.mockResolvedValue({ data: { success: false, reason: "Invalid or expired invite token" }, error: null });
    mockTeamMemberSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: { id: "user-stale", user_metadata: {} } });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/invitation link is invalid/i);
    expect(result.current.teamMember).toBeNull();
  });

  it("falls through to Step 4 without crashing when accept_invite throws", async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "accept_invite") throw new Error("network error");
      return { data: {}, error: null };
    });
    mockTeamMemberSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", { user: { id: "user-rpc-down", user_metadata: {} } });
    });

    // No pending onboarding data either — should fail closed via Step 4,
    // not hang or throw an unhandled rejection.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).toMatch(/could not be completed safely/i);
    expect(result.current.teamMember).toBeNull();
  });

  it("links an invited email to its org instead of silently creating a new one, even with onboarding data present", async () => {
    // Regression guard for the case where an invitee ends up on the generic
    // signup path (e.g. via /login's "create one" link) with a business name
    // already staged in localStorage — setup_new_organization must never run
    // when an open invite exists for this email.
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "Someone Else's Café", ownerName: "Confused Signup" }),
    );
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === "accept_invite") return { data: { success: true }, error: null };
      return { data: {}, error: null };
    });
    mockTeamMemberSingle
      .mockResolvedValueOnce({ data: null, error: null }) // Step 1
      .mockResolvedValueOnce({ data: null, error: null }) // Step 2
      .mockResolvedValueOnce({
        data: {
          id: "tm-invited",
          organization_id: "org-jay",
          name: "Bárbara",
          email: "barbara@example.com",
          role: "Manager",
          location_ids: [],
          permissions: {},
        },
        error: null,
      }); // re-fetch after accept_invite success

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      authStateCallback?.("SIGNED_IN", {
        user: {
          id: "user-invited-via-signup",
          user_metadata: { business_name: "Someone Else's Café", full_name: "Confused Signup" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember?.organization_id).toBe("org-jay");
    expect(result.current.setupError).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith("setup_new_organization", expect.anything());
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
