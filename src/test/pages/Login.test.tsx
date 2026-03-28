import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";

const { mockSignInWithOtp } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
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

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
  });

  it("renders an email-only sign-in form", () => {
    renderPage();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@yourbusiness.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter the code from your email/i)).not.toBeInTheDocument();
  });

  it("sends a magic link to the email address", async () => {
    import.meta.env.VITE_PUBLIC_SITE_URL = "https://dora.github.io/olia";
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
        email: "owner@olia.app",
        options: expect.objectContaining({
          shouldCreateUser: false,
          emailRedirectTo: "https://dora.github.io/olia?p=%2Fauth%2Fcallback",
        }),
      }));
    });

    expect(screen.getByText(/magic link to owner@olia.app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend link/i })).toBeInTheDocument();
  });

  it("shows a create-account link", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/signup");
  });

  it("redirects authenticated users to admin", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });
});
