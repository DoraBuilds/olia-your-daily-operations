import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Layout } from "@/components/Layout";
import { grantKioskAdminSession, hasActiveKioskAdminSession, clearKioskAdminSession } from "@/lib/kiosk-admin-session";
import { renderWithProviders } from "../test-utils";

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [],
    selectedConceptId: "all",
    setSelectedConceptId: () => {},
    scopedLocationIds: null,
  }),
}));

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
    sessionStorage.clear();
    vi.useRealTimers();
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

  it("vertically centers short page content via a flex column + auto-margin wrapper on portrait viewports only, so a short page doesn't strand content at the top with a large empty gap below on a tall (e.g. tablet-portrait) viewport — while staying top-anchored under the header in landscape/desktop", () => {
    renderWithProviders(<Layout title="T"><p>content</p></Layout>);
    const contentText = screen.getByText("content");
    const main = contentText.closest("main");
    expect(main).not.toBeNull();
    expect(main).toHaveClass("flex", "flex-col");
    // The immediate wrapper around children carries portrait:my-auto: its
    // margin collapses to 0 once content overflows the pane (long pages
    // still start at the top and scroll normally), and it only centers a
    // short page in portrait orientation — landscape/desktop pages (e.g.
    // the Admin Billing tab) stay anchored under the header instead of
    // drifting to the vertical middle of the pane.
    expect(contentText.parentElement).toHaveClass("portrait:my-auto");
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

  describe("with a live kiosk-PIN admin session", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: MOCK_USER, signOut: mockSignOut });
      grantKioskAdminSession("staff-1", "location-1");
    });

    it("shows 'Back to Kiosk' instead of the real Log out button — signing out the real session would break the kiosk's PIN flow for everyone", () => {
      renderWithProviders(<Layout title="T"><span /></Layout>);
      expect(screen.getByText(/back to kiosk|kiosk/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
    });

    it("revokes the grant and navigates to /kiosk when 'Back to Kiosk' is clicked", () => {
      renderWithProviders(<Layout title="T"><span /></Layout>);
      fireEvent.click(screen.getByText(/kiosk/i));
      expect(mockNavigate).toHaveBeenCalledWith("/kiosk");
      expect(hasActiveKioskAdminSession()).toBe(false);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("auto-returns to /kiosk and revokes the grant after 90s of inactivity", () => {
      vi.useFakeTimers();
      renderWithProviders(<Layout title="T"><span /></Layout>);

      act(() => {
        vi.advanceTimersByTime(90000);
      });

      expect(mockNavigate).toHaveBeenCalledWith("/kiosk");
      expect(hasActiveKioskAdminSession()).toBe(false);
    });

    it("resets the 90s timer on user activity instead of bouncing early", () => {
      vi.useFakeTimers();
      renderWithProviders(<Layout title="T"><span /></Layout>);

      vi.advanceTimersByTime(60000);
      fireEvent.mouseMove(window);
      vi.advanceTimersByTime(60000);

      expect(mockNavigate).not.toHaveBeenCalledWith("/kiosk");
      expect(hasActiveKioskAdminSession()).toBe(true);
    });

    // Regression guard (#727): "Exit kiosk mode" in Admin's My Location tab
    // clears this same grant from outside Layout's own tree. Layout must
    // stop the timer and swap the button back immediately, not only after
    // some unrelated re-render.
    it("stops the inactivity timer and swaps back to a normal Log out button the instant the grant is cleared from elsewhere", () => {
      renderWithProviders(<Layout title="T"><span /></Layout>);
      expect(screen.getByText(/back to kiosk|kiosk/i)).toBeInTheDocument();

      act(() => {
        clearKioskAdminSession();
      });

      expect(screen.queryByText(/back to kiosk/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();

      // The effect's cleanup already tore down the real inactivity timer it
      // had scheduled (isKioskAdminSession flipped false), so switching to
      // fake timers now and fast-forwarding must not trigger a stray /kiosk
      // navigation from that old timer.
      vi.useFakeTimers();
      mockNavigate.mockClear();
      vi.advanceTimersByTime(90000);
      expect(mockNavigate).not.toHaveBeenCalledWith("/kiosk");
    });
  });

  it("shows the real Log out button (not 'Back to Kiosk') for a normal authenticated session with no kiosk grant", () => {
    mockUseAuth.mockReturnValue({ user: MOCK_USER, signOut: mockSignOut });
    renderWithProviders(<Layout title="T"><span /></Layout>);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});
