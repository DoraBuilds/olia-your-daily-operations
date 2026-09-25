import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isSupportModeActive } from "@/lib/support-mode";

const { mockOnAuthStateChange, mockRpc, mockQueryClientClear, mockTeamMemberSingle } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockRpc: vi.fn(),
  mockQueryClientClear: vi.fn(),
  mockTeamMemberSingle: vi.fn(),
}));

let authStateCallback: ((event: string, session: unknown) => void) | null = null;

mockOnAuthStateChange.mockImplementation((callback) => {
  authStateCallback = callback;
  callback("INITIAL_SESSION", null);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { onAuthStateChange: mockOnAuthStateChange, signOut: vi.fn() },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockTeamMemberSingle,
    }),
    rpc: mockRpc,
  },
}));

vi.mock("@/lib/query-client", () => ({ queryClient: { clear: mockQueryClientClear } }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

const OWN_ROW = {
  id: "admin-1",
  organization_id: "own-org",
  name: "Dora",
  email: "dora@example.com",
  role: "Owner",
  is_owner: true,
  location_ids: [],
  permissions: {},
  language: "en",
};

const CUSTOMER = { id: "customer-org", name: "Customer B" };

let status: { is_admin: boolean; viewing: { id: string; name: string } | null };
let ownRow: Record<string, unknown> | null;

function rpcNames() {
  return mockRpc.mock.calls.map(([name]) => name);
}

async function signIn() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    authStateCallback?.("SIGNED_IN", { user: { id: "admin-1", email: "dora@example.com", user_metadata: {} } });
  });
  return hook;
}

describe("AuthContext — platform admin support mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    status = { is_admin: false, viewing: null };
    ownRow = OWN_ROW;
    mockTeamMemberSingle.mockImplementation(async () => ({ data: ownRow, error: null }));
    mockRpc.mockImplementation(async (name: string, args?: { p_org_id?: string }) => {
      if (name === "platform_admin_status") return { data: status, error: null };
      if (name === "platform_admin_enter_org") {
        status = { is_admin: true, viewing: { ...CUSTOMER, id: args?.p_org_id ?? CUSTOMER.id } };
        return { data: status.viewing, error: null };
      }
      if (name === "platform_admin_exit_org") {
        status = { is_admin: true, viewing: null };
        return { data: null, error: null };
      }
      return { data: {}, error: null };
    });
  });

  it("non-admins keep their own profile and never enter support mode", async () => {
    const { result } = await signIn();
    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("own-org"));
    expect(result.current.platformAdmin).toEqual({ isAdmin: false, viewingOrg: null });
    expect(isSupportModeActive()).toBe(false);
  });

  it("treats a failing status RPC as not-an-admin", async () => {
    mockRpc.mockImplementation(async () => { throw new Error("network"); });
    const { result } = await signIn();
    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("own-org"));
    expect(result.current.platformAdmin.isAdmin).toBe(false);
  });

  it("an admin already viewing an org gets a synthetic owner profile for that org", async () => {
    status = { is_admin: true, viewing: CUSTOMER };
    const { result } = await signIn();

    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("customer-org"));
    expect(result.current.teamMember).toMatchObject({
      id: "admin-1",
      name: "Olia Support",
      email: "dora@example.com",
      is_owner: true,
      role: "Owner",
    });
    expect(Object.values(result.current.teamMember!.permissions).every(Boolean)).toBe(true);
    expect(result.current.platformAdmin.viewingOrg).toEqual(CUSTOMER);
    expect(isSupportModeActive()).toBe(true);
    expect(mockTeamMemberSingle).not.toHaveBeenCalled();
  });

  it("an admin with no org of their own is never auto-onboarded or invite-accepted", async () => {
    status = { is_admin: true, viewing: null };
    ownRow = null;
    const { result } = await signIn();

    await waitFor(() => expect(result.current.platformAdmin.isAdmin).toBe(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.teamMember).toBeNull();
    expect(result.current.setupError).toBeNull();
    expect(rpcNames()).not.toContain("accept_invite");
    expect(rpcNames()).not.toContain("setup_new_organization");
  });

  it("enterOrg switches to the customer org, clearing the cache, and shows loading mid-switch", async () => {
    status = { is_admin: true, viewing: null };
    const { result } = await signIn();
    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("own-org"));
    mockQueryClientClear.mockClear();

    // Pause the post-enter status fetch to inspect the intermediate state.
    let releaseStatus: () => void = () => {};
    const baseImpl = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation(async (name: string, args?: { p_org_id?: string }) => {
      if (name === "platform_admin_status") {
        await new Promise<void>((resolve) => { releaseStatus = resolve; });
      }
      return baseImpl(name, args);
    });

    let entering: Promise<void>;
    act(() => { entering = result.current.enterOrg("customer-org"); });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("platform_admin_enter_org", { p_org_id: "customer-org" });
    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);

    await act(async () => { releaseStatus(); await entering; });
    expect(result.current.loading).toBe(false);
    expect(result.current.teamMember?.organization_id).toBe("customer-org");
    expect(isSupportModeActive()).toBe(true);
  });

  it("enterOrg surfaces RPC errors without touching the current profile", async () => {
    status = { is_admin: true, viewing: null };
    const { result } = await signIn();
    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("own-org"));

    mockRpc.mockImplementationOnce(async () => ({ data: null, error: new Error("Not a platform admin") }));
    await expect(act(() => result.current.enterOrg("customer-org"))).rejects.toThrow("Not a platform admin");
    expect(result.current.teamMember?.organization_id).toBe("own-org");
  });

  it("exitOrg returns to the admin's own profile", async () => {
    status = { is_admin: true, viewing: CUSTOMER };
    const { result } = await signIn();
    await waitFor(() => expect(result.current.teamMember?.organization_id).toBe("customer-org"));

    await act(() => result.current.exitOrg());
    expect(rpcNames()).toContain("platform_admin_exit_org");
    expect(result.current.teamMember?.organization_id).toBe("own-org");
    expect(result.current.platformAdmin.viewingOrg).toBeNull();
    expect(isSupportModeActive()).toBe(false);
  });

  it("signing out clears support mode", async () => {
    status = { is_admin: true, viewing: CUSTOMER };
    const { result } = await signIn();
    await waitFor(() => expect(isSupportModeActive()).toBe(true));

    await act(async () => { authStateCallback?.("SIGNED_OUT", null); });
    expect(result.current.platformAdmin).toEqual({ isAdmin: false, viewingOrg: null });
    expect(isSupportModeActive()).toBe(false);
  });
});
