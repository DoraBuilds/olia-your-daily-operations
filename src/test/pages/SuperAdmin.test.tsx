import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SuperAdmin, { filterOrgs, type PlatformOrg } from "@/pages/SuperAdmin";
import { SupportModeBanner } from "@/components/SupportModeBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const { mockUseAuth, mockRpc, mockToastError } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockRpc: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mockRpc } }));
vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

const ORGS: PlatformOrg[] = [
  {
    id: "org-a", name: "Acme Hospitality", plan: "growth", plan_status: "active",
    created_at: "2026-05-01T00:00:00Z", deletion_requested_at: null,
    owner_name: "Ana Owner", owner_email: "ana@acme.com", member_count: 12, location_count: 3,
  },
  {
    id: "org-b", name: "Bistro Bee", plan: "starter", plan_status: "trialing",
    created_at: "2026-09-01T00:00:00Z", deletion_requested_at: "2026-09-20T00:00:00Z",
    owner_name: null, owner_email: null, member_count: 1, location_count: 1,
  },
];

const ACCESS = [
  { id: 2, admin_email: "dora@oliahq.com", organization_id: "org-a", organization_name: "Acme Hospitality", action: "exit", created_at: "2026-09-25T10:05:00Z" },
  { id: 1, admin_email: "dora@oliahq.com", organization_id: null, organization_name: null, action: "enter", created_at: "2026-09-25T10:00:00Z" },
];

function authState(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "admin-1" },
    loading: false,
    teamMember: { id: "admin-1", organization_id: "own-org" },
    platformAdmin: { isAdmin: true, viewingOrg: null },
    enterOrg: vi.fn().mockResolvedValue(undefined),
    exitOrg: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderAt(path: string, element: JSX.Element = <SuperAdmin />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/app" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("filterOrgs", () => {
  it("returns everything for an empty query", () => {
    expect(filterOrgs(ORGS, "  ")).toHaveLength(2);
  });

  it("matches org name, owner name, owner email and id, case-insensitively", () => {
    expect(filterOrgs(ORGS, "bistro").map((o) => o.id)).toEqual(["org-b"]);
    expect(filterOrgs(ORGS, "ANA OWNER").map((o) => o.id)).toEqual(["org-a"]);
    expect(filterOrgs(ORGS, "acme.com").map((o) => o.id)).toEqual(["org-a"]);
    expect(filterOrgs(ORGS, "org-b").map((o) => o.id)).toEqual(["org-b"]);
    expect(filterOrgs(ORGS, "nobody")).toEqual([]);
  });
});

describe("SuperAdmin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockImplementation(async (name: string) => {
      if (name === "platform_admin_list_orgs") return { data: ORGS, error: null };
      if (name === "platform_admin_recent_access") return { data: ACCESS, error: null };
      return { data: null, error: null };
    });
  });

  it("sends non-admins to the dashboard without loading any org data", () => {
    mockUseAuth.mockReturnValue(authState({ platformAdmin: { isAdmin: false, viewingOrg: null } }));
    renderAt("/super-admin");
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to login", () => {
    mockUseAuth.mockReturnValue(authState({ user: null, platformAdmin: { isAdmin: false, viewingOrg: null } }));
    renderAt("/super-admin");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("shows a loading state while auth resolves", () => {
    mockUseAuth.mockReturnValue(authState({ loading: true, platformAdmin: { isAdmin: false, viewingOrg: null } }));
    renderAt("/super-admin");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("lists every org with owner, plan and counts, plus the recent access log", async () => {
    mockUseAuth.mockReturnValue(authState());
    renderAt("/super-admin");

    expect(await screen.findByText("Acme Hospitality", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Ana Owner · ana@acme.com")).toBeInTheDocument();
    expect(screen.getByText(/12 members · 3 locations/)).toBeInTheDocument();
    expect(screen.getByText("No owner")).toBeInTheDocument();
    expect(screen.getByText("Deleting")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();

    expect(await screen.findByText("a deleted org")).toBeInTheDocument();
    expect(screen.getAllByText(/dora@oliahq.com/)).toHaveLength(2);
    expect(mockRpc).toHaveBeenCalledWith("platform_admin_recent_access", { p_limit: 20 });
  });

  it("filters the list as you type", async () => {
    mockUseAuth.mockReturnValue(authState());
    renderAt("/super-admin");
    await screen.findByText("Bistro Bee");

    fireEvent.change(screen.getByLabelText("Search organizations"), { target: { value: "acme" } });
    expect(screen.queryByText("Bistro Bee")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search organizations"), { target: { value: "zzz" } });
    expect(screen.getByText(/No organizations match/)).toBeInTheDocument();
  });

  it("enters an org and goes to its dashboard", async () => {
    const auth = authState();
    mockUseAuth.mockReturnValue(auth);
    renderAt("/super-admin");

    fireEvent.click(await screen.findByRole("button", { name: "Enter Bistro Bee" }));
    await waitFor(() => expect(auth.enterOrg).toHaveBeenCalledWith("org-b"));
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("stays put and toasts when entering fails", async () => {
    const auth = authState({ enterOrg: vi.fn().mockRejectedValue(new Error("Organization not found")) });
    mockUseAuth.mockReturnValue(auth);
    renderAt("/super-admin");

    fireEvent.click(await screen.findByRole("button", { name: "Enter Acme Hospitality" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Organization not found"));
    expect(screen.getByText("Support console")).toBeInTheDocument();
  });

  it("shows the org being viewed and can exit support mode", async () => {
    const auth = authState({ platformAdmin: { isAdmin: true, viewingOrg: { id: "org-a", name: "Acme Hospitality" } } });
    mockUseAuth.mockReturnValue(auth);
    renderAt("/super-admin");

    expect(await screen.findByRole("button", { name: "Enter Acme Hospitality" })).toHaveTextContent("Viewing");
    fireEvent.click(screen.getByRole("button", { name: "Exit support mode" }));
    await waitFor(() => expect(auth.exitOrg).toHaveBeenCalled());
  });

  it("shows an error when the org list can't load", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    mockUseAuth.mockReturnValue(authState());
    renderAt("/super-admin");
    expect(await screen.findByText("Could not load organizations.")).toBeInTheDocument();
  });

  it("hides Back to app for an admin with no org of their own", async () => {
    mockUseAuth.mockReturnValue(authState({ teamMember: null }));
    renderAt("/super-admin");
    await screen.findByText("Bistro Bee");
    expect(screen.queryByText("Back to app")).not.toBeInTheDocument();
  });
});

describe("SupportModeBanner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing outside support mode", () => {
    mockUseAuth.mockReturnValue(authState());
    const { container } = renderAt("/app", <SupportModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tolerates an auth context without platformAdmin", () => {
    mockUseAuth.mockReturnValue({ teamMember: null });
    const { container } = renderAt("/app", <SupportModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the org and exits back to the console", async () => {
    const auth = authState({ platformAdmin: { isAdmin: true, viewingOrg: { id: "org-a", name: "Acme Hospitality" } } });
    mockUseAuth.mockReturnValue(auth);
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderAt("/app", <SupportModeBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Support mode — viewing Acme Hospitality");
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(auth.exitOrg).toHaveBeenCalled());
    expect(await screen.findByText("Support console")).toBeInTheDocument();
  });

  it("Switch opens the console without exiting", async () => {
    const auth = authState({ platformAdmin: { isAdmin: true, viewingOrg: { id: "org-a", name: "Acme Hospitality" } } });
    mockUseAuth.mockReturnValue(auth);
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderAt("/app", <SupportModeBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(await screen.findByText("Support console")).toBeInTheDocument();
    expect(auth.exitOrg).not.toHaveBeenCalled();
  });

  it("toasts when exiting fails", async () => {
    const auth = authState({
      platformAdmin: { isAdmin: true, viewingOrg: { id: "org-a", name: "Acme Hospitality" } },
      exitOrg: vi.fn().mockRejectedValue(new Error("offline")),
    });
    mockUseAuth.mockReturnValue(auth);
    renderAt("/app", <SupportModeBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("offline"));
  });
});

describe("ProtectedRoute for platform admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends an admin with no org of their own to the support console", async () => {
    mockUseAuth.mockReturnValue(authState({ teamMember: null }));
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderAt("/app", <ProtectedRoute><p>Org page</p></ProtectedRoute>);
    expect(await screen.findByText("Support console")).toBeInTheDocument();
    expect(screen.queryByText("Org page")).not.toBeInTheDocument();
  });

  it("lets an admin with a profile through", () => {
    mockUseAuth.mockReturnValue(authState());
    renderAt("/app", <ProtectedRoute><p>Org page</p></ProtectedRoute>);
    expect(screen.getByText("Org page")).toBeInTheDocument();
  });
});
