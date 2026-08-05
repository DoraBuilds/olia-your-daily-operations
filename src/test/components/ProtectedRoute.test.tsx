import { screen, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { grantKioskAdminSession } from "@/lib/kiosk-admin-session";
import { renderWithProviders } from "../test-utils";

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
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ProtectedRoute", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows loading spinner text when loading=true", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderWithProviders(
      <ProtectedRoute>
        <p>Protected content</p>
      </ProtectedRoute>
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when user is present", () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" }, loading: false });
    renderWithProviders(
      <ProtectedRoute>
        <p>Protected content</p>
      </ProtectedRoute>
    );
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("navigates to /login when no user and not loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, setupError: null, signOut: vi.fn() });
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
          <Route path="/login" element={<p>Login screen</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login screen")).toBeInTheDocument();
  });

  it("navigates to /signup and calls signOut when setupError is set", () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
      setupError: "Account setup failed",
      signOut: mockSignOut,
    });
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
          <Route path="/signup" element={<p>Signup screen</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Signup screen")).toBeInTheDocument();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("carries the setupError reason through as a URL-encoded detail param", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
      setupError: "Your invitation link is invalid or has already been used.",
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    function SignupProbe() {
      return <p>search:{useLocation().search}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
          <Route path="/signup" element={<SignupProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/reason=account-reset/)).toBeInTheDocument();
    expect(
      screen.getByText(/detail=Your%20invitation%20link%20is%20invalid/),
    ).toBeInTheDocument();
  });

  describe("on a configured kiosk device", () => {
    beforeEach(() => {
      localStorage.setItem("kiosk_location_id", "location-1");
      // A lingering owner session is exactly what makes the kiosk's own PIN
      // hop into /admin possible — and exactly what a direct-navigation
      // exploit would otherwise ride on for every other protected route.
      mockUseAuth.mockReturnValue({ user: { id: "owner-1" }, loading: false, setupError: null, signOut: vi.fn() });
    });

    it("redirects /dashboard back to /kiosk even though a live session exists", () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
            <Route path="/kiosk" element={<p>Kiosk screen</p>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
      expect(screen.getByText("Kiosk screen")).toBeInTheDocument();
    });

    it("redirects /admin/location back to /kiosk when there is no PIN-granted session", () => {
      render(
        <MemoryRouter initialEntries={["/admin/location"]}>
          <Routes>
            <Route path="/admin/location" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
            <Route path="/kiosk" element={<p>Kiosk screen</p>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
      expect(screen.getByText("Kiosk screen")).toBeInTheDocument();
    });

    it("lets /admin/location through with a live PIN-granted kiosk admin session", () => {
      grantKioskAdminSession("staff-1", "location-1");
      render(
        <MemoryRouter initialEntries={["/admin/location"]}>
          <Routes>
            <Route path="/admin/location" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
            <Route path="/kiosk" element={<p>Kiosk screen</p>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });

    it("still redirects /dashboard to /kiosk even with a live PIN-granted session (PIN only ever authorizes /admin)", () => {
      grantKioskAdminSession("staff-1", "location-1");
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><p>Protected content</p></ProtectedRoute>} />
            <Route path="/kiosk" element={<p>Kiosk screen</p>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
      expect(screen.getByText("Kiosk screen")).toBeInTheDocument();
    });
  });
});
