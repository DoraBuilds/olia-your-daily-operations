import { screen, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
    mockUseAuth.mockReturnValue({ user: null, loading: false });
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
});
