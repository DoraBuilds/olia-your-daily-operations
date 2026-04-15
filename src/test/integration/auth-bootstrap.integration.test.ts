// @vitest-environment jsdom
/**
 * Integration tests: AuthContext bootstrap
 *
 * Verifies that AuthProvider initialises correctly across the key scenarios:
 *   - No session (unauthenticated state)
 *   - Returning user with an existing team_member row
 *   - First-time user with onboarding data in localStorage
 *   - First-time user with onboarding data only in auth metadata
 *   - Missing onboarding data → fail-closed with setupError
 *   - Token refresh → does NOT re-trigger team_member fetch
 *   - Sign-out → clears teamMember and query cache
 *   - retrySetup → re-invokes fetchTeamMember
 *
 * All Supabase interactions are mocked; no real instance is required.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// ── Hoisted mocks (must be before vi.mock factories) ───────────────────────

const {
  mockSignOut,
  mockOnAuthStateChange,
  mockRpc,
  mockQueryClientClear,
  mockTeamMemberSingle,
} = vi.hoisted(() => ({
  mockSignOut:           vi.fn().mockResolvedValue({}),
  mockOnAuthStateChange: vi.fn(),
  mockRpc:               vi.fn().mockResolvedValue({ data: {}, error: null }),
  mockQueryClientClear:  vi.fn(),
  mockTeamMemberSingle:  vi.fn(),
}));

// Captures the callback registered by AuthProvider so tests can simulate
// auth events without coupling to internals.
let capturedAuthCallback: ((event: string, session: any) => void) | null = null;

mockOnAuthStateChange.mockImplementation((cb) => {
  capturedAuthCallback = cb;
  // Supabase fires INITIAL_SESSION synchronously on mount
  cb("INITIAL_SESSION", null);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      signOut:           mockSignOut,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: mockTeamMemberSingle,
    }),
    rpc: mockRpc,
  },
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: { clear: mockQueryClientClear },
}));

// ── Helper ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries:   { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: qc },
      createElement(AuthProvider, null, children),
    );
  };
}

const RETURNING_USER_ROW = {
  id:              "user-ret-1",
  organization_id: "org-ret-1",
  name:            "Returning User",
  email:           "returning@test.com",
  role:            "Owner",
  location_ids:    [],
  permissions:     {},
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AuthContext bootstrap integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAuthCallback = null;
    localStorage.clear();

    // Re-register the INITIAL_SESSION callback after clearAllMocks resets it
    mockOnAuthStateChange.mockImplementation((cb) => {
      capturedAuthCallback = cb;
      cb("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    mockTeamMemberSingle.mockResolvedValue({ data: null, error: null });
  });

  // ── Unauthenticated ────────────────────────────────────────────────────

  it("resolves with null user, session, and teamMember when there is no session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.teamMember).toBeNull();
    expect(result.current.setupError).toBeNull();
  });

  it("exposes a callable signOut function when unauthenticated", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.signOut(); });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  // ── Returning user ─────────────────────────────────────────────────────

  it("sets teamMember from an existing row — does NOT call setup_new_organization", async () => {
    mockTeamMemberSingle.mockResolvedValue({ data: RETURNING_USER_ROW, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: {
          id:            "user-ret-1",
          user_metadata: { business_name: "Org", full_name: "Returning User" },
        },
      });
    });

    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("org-ret-1"));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("clears the React Query cache on SIGNED_IN to prevent cross-account data leaks", async () => {
    mockTeamMemberSingle.mockResolvedValue({ data: RETURNING_USER_ROW, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // INITIAL_SESSION fires once (no user) → 1 clear already
    const clearsBefore = mockQueryClientClear.mock.calls.length;

    await act(async () => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: {
          id:            "user-ret-1",
          user_metadata: { business_name: "Org", full_name: "Returning User" },
        },
      });
    });

    await waitFor(() => expect(result.current.teamMember).not.toBeNull());
    expect(mockQueryClientClear.mock.calls.length).toBeGreaterThan(clearsBefore);
  });

  // ── First-time user — localStorage onboarding ──────────────────────────

  it("calls setup_new_organization using onboarding data from localStorage", async () => {
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({ businessName: "New Café", ownerName: "Jane Doe" }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: {
          id:            "user-new-1",
          user_metadata: {},
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("setup_new_organization", {
      p_business_name: "New Café",
      p_owner_name:    "Jane Doe",
    });
    // pending key must be cleared after successful setup
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
  });

  // ── First-time user — auth metadata onboarding ─────────────────────────

  it("falls back to user_metadata when localStorage has no pending onboarding", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: {
          id:            "user-new-2",
          user_metadata: { business_name: "Meta Café", full_name: "Bob Smith" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("setup_new_organization", {
      p_business_name: "Meta Café",
      p_owner_name:    "Bob Smith",
    });
  });

  // ── Missing onboarding data — fail-closed ─────────────────────────────

  it("sets setupError and keeps teamMember null when business name is missing", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: { id: "user-incomplete-1", user_metadata: {} },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setupError).toMatch(/could not be completed safely/i);
    expect(result.current.teamMember).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sets setupError when owner name is missing even if business name is present", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: {
          id:            "user-incomplete-2",
          user_metadata: { business_name: "No Owner Café" },
        },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setupError).toMatch(/could not be completed safely/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── Token refresh — no re-fetch ────────────────────────────────────────

  it("does NOT re-fetch team_member or invoke setup_new_organization on TOKEN_REFRESHED", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedAuthCallback?.("TOKEN_REFRESHED", {
        user: {
          id:            "user-token-1",
          user_metadata: { business_name: "Café", full_name: "Alice" },
        },
      });
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockTeamMemberSingle).not.toHaveBeenCalled();
  });

  // ── Sign-out ───────────────────────────────────────────────────────────

  it("clears teamMember and query cache on SIGNED_OUT", async () => {
    mockTeamMemberSingle.mockResolvedValue({ data: RETURNING_USER_ROW, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Sign in first
    await act(async () => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: { id: "user-ret-1", user_metadata: {} },
      });
    });
    await waitFor(() => expect(result.current.teamMember).not.toBeNull());

    const clearsBefore = mockQueryClientClear.mock.calls.length;

    // Now sign out
    await act(async () => {
      capturedAuthCallback?.("SIGNED_OUT", null);
    });

    await waitFor(() => expect(result.current.teamMember).toBeNull());
    expect(mockQueryClientClear.mock.calls.length).toBeGreaterThan(clearsBefore);
    expect(result.current.setupError).toBeNull();
  });

  // ── retrySetup ─────────────────────────────────────────────────────────

  it("retrySetup re-invokes fetchTeamMember for the currently logged-in user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate a signed-in user with missing onboarding
    act(() => {
      capturedAuthCallback?.("SIGNED_IN", {
        user: { id: "user-retry-1", user_metadata: {} },
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setupError).not.toBeNull();

    // Now the team member row exists (e.g., created via a support fix)
    mockTeamMemberSingle.mockResolvedValue({
      data: { ...RETURNING_USER_ROW, id: "user-retry-1" },
      error: null,
    });

    await act(async () => {
      result.current.retrySetup();
    });

    await waitFor(() => expect(result.current.teamMember?.id).toBe("user-retry-1"));
    expect(result.current.setupError).toBeNull();
  });
});
