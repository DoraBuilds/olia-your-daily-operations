import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Layout } from "@/components/Layout";
import { renderWithProviders } from "../test-utils";

// ─── Hoist mock vars ──────────────────────────────────────────────────────────
const { mockSignOut, mockNavigate, mockUseAuth } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockNavigate: vi.fn(),
  mockUseAuth: vi.fn(),
}));

// Default: not logged in
mockUseAuth.mockReturnValue({ user: null, signOut: mockSignOut });

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MOCK_USER = { id: "user-1", email: "owner@example.com" };

describe("Layout", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, signOut: mockSignOut });
    mockSignOut.mockClear();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children content", () => {
    renderWithProviders(<Layout><p>Hello children</p></Layout>);
    expect(screen.getByText("Hello children")).toBeInTheDocument();
  });

  it("scrolls the shared content container to the top on mount", () => {
    const scrollTopSpy = vi.spyOn(HTMLElement.prototype, "scrollTop", "set");

    renderWithProviders(<Layout title="T"><span /></Layout>);

    expect(scrollTopSpy).toHaveBeenCalledWith(0);
  });

  it("shows header with title when title prop is provided", () => {
    renderWithProviders(<Layout title="My Title"><span /></Layout>);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("shows subtitle when subtitle prop is provided", () => {
    renderWithProviders(
      <Layout title="My Title" subtitle="My Subtitle"><span /></Layout>
    );
    expect(screen.getByText("My Subtitle")).toBeInTheDocument();
  });

  it("does NOT render a header element when title is omitted", () => {
    renderWithProviders(<Layout><p>no title</p></Layout>);
    expect(document.querySelector("header")).toBeNull();
  });

  it("renders headerLeft content when provided", () => {
    renderWithProviders(
      <Layout title="T" headerLeft={<button>Left Btn</button>}><span /></Layout>
    );
    expect(screen.getByText("Left Btn")).toBeInTheDocument();
  });

  it("renders headerRight content when provided", () => {
    renderWithProviders(
      <Layout title="T" headerRight={<button>Right Btn</button>}><span /></Layout>
    );
    expect(screen.getByText("Right Btn")).toBeInTheDocument();
  });

  it("renders the BottomNav", () => {
    renderWithProviders(<Layout title="T"><span /></Layout>);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Checklists").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reporting").length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT show logout button when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, signOut: mockSignOut });
    renderWithProviders(<Layout title="T"><span /></Layout>);
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
  });

  it("shows logout button when user is authenticated", () => {
    mockUseAuth.mockReturnValue({ user: MOCK_USER, signOut: mockSignOut });
    renderWithProviders(<Layout title="T"><span /></Layout>);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("logout button is visible alongside custom headerRight content", () => {
    mockUseAuth.mockReturnValue({ user: MOCK_USER, signOut: mockSignOut });
    renderWithProviders(
      <Layout title="T" headerRight={<button>Action</button>}><span /></Layout>
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("calls signOut and navigates to / when logout button is clicked", async () => {
    mockUseAuth.mockReturnValue({ user: MOCK_USER, signOut: mockSignOut });
    renderWithProviders(<Layout title="T"><span /></Layout>);

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
