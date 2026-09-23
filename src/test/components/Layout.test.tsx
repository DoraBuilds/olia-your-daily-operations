import { screen, fireEvent, act } from "@testing-library/react";
import { Layout } from "@/components/Layout";
import { grantKioskAdminSession, hasActiveKioskAdminSession, clearKioskAdminSession } from "@/lib/kiosk-admin-session";
import { grantKioskStaffSession, readKioskStaffSession } from "@/lib/kiosk-staff-session";
import { renderWithProviders } from "../test-utils";

// ─── Hoist mock vars ──────────────────────────────────────────────────────────
// Layout itself no longer calls useAuth() (Log out moved to AccountTab.tsx —
// see src/test/pages/admin/AccountTab.test.tsx), but SidebarNav (rendered
// inside Layout) still does, so this mock stays for its sake.
const { mockNavigate, mockUseAuth } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuth: vi.fn(),
}));

mockUseAuth.mockReturnValue({ teamMember: null });

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("Layout", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ teamMember: null });
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

  it("does NOT render a header at all for a title-less page with no kiosk session (Log out lives in Admin > Account now)", () => {
    renderWithProviders(<Layout><p>no title</p></Layout>);
    expect(document.querySelector("header")).toBeNull();
  });

  describe("with a live kiosk-PIN admin session", () => {
    beforeEach(() => {
      localStorage.setItem("kiosk_location_id", "location-1");
      grantKioskAdminSession("staff-1", "location-1");
    });

    afterEach(() => {
      localStorage.removeItem("kiosk_location_id");
    });

    it("shows a title-less 'Back to Kiosk' strip even on a page with no title, so a kiosk grant always has an exit", () => {
      renderWithProviders(<Layout><p>no title</p></Layout>);
      expect(document.querySelector("header")).not.toBeNull();
      expect(screen.getByText(/back to kiosk|kiosk/i)).toBeInTheDocument();
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

    // Regression guard (#796): a live kiosk-staff-session grant (the
    // boot-time identify PIN, kiosk-staff-session.ts) survived both of
    // these exits, so /kiosk remounted straight onto the already-identified
    // grid instead of the locked PIN screen — making it look like the
    // device never actually locked back down.
    it("also revokes the identify-PIN grant when 'Back to Kiosk' is clicked", () => {
      grantKioskStaffSession({ staffId: "s1", staffName: "Staff", organizationId: "org-1", departmentIds: [] });
      renderWithProviders(<Layout title="T"><span /></Layout>);

      fireEvent.click(screen.getByText(/kiosk/i));

      expect(readKioskStaffSession()).toBeNull();
    });

    it("also revokes the identify-PIN grant after 90s of inactivity", () => {
      grantKioskStaffSession({ staffId: "s1", staffName: "Staff", organizationId: "org-1", departmentIds: [] });
      vi.useFakeTimers();
      renderWithProviders(<Layout title="T"><span /></Layout>);

      act(() => {
        vi.advanceTimersByTime(90000);
      });

      expect(readKioskStaffSession()).toBeNull();
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
    // stop the timer and drop "Back to Kiosk" immediately, not only after
    // some unrelated re-render.
    it("stops the inactivity timer and hides 'Back to Kiosk' the instant the grant is cleared from elsewhere", () => {
      renderWithProviders(<Layout title="T"><span /></Layout>);
      expect(screen.getByText(/back to kiosk|kiosk/i)).toBeInTheDocument();

      act(() => {
        clearKioskAdminSession();
      });

      expect(screen.queryByText(/back to kiosk/i)).not.toBeInTheDocument();

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
});
