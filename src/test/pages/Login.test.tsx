import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";

const { mockSignInWithOtp, mockVerifyOtp } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
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
    mockVerifyOtp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
  });

  it("renders an email-first sign-in form", () => {
    renderPage();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@yourbusiness.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter the code from your email/i)).not.toBeInTheDocument();
  });

  it("sends a code to the email address", async () => {
    import.meta.env.VITE_PUBLIC_SITE_URL = "https://dora.github.io/olia";
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
        email: "owner@olia.app",
        options: expect.objectContaining({
          shouldCreateUser: false,
          emailRedirectTo: "https://dora.github.io/olia?p=%2Fauth%2Fcallback",
        }),
      }));
    });

    expect(screen.getByText(/8-digit code to owner@olia.app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend code/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter the code from your email/i)).toBeInTheDocument();
  });

  it("verifies the emailed code and navigates to admin", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => expect(screen.getByPlaceholderText(/Enter the code from your email/i)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Enter the code from your email/i), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "owner@olia.app",
        token: "12345678",
        type: "email",
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });

  it("shows a create-account link", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/signup");
  });

  it("lets users switch to code entry if they already have a code", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });

    fireEvent.click(screen.getByRole("button", { name: /I already have a code/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter the code from your email/i)).toBeInTheDocument();
      expect(screen.getByText(/most recent code sent to owner@olia.app/i)).toBeInTheDocument();
    });
  });

  it("keeps users on the code step when the email send is rate-limited", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "email rate limit exceeded" },
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter the code from your email/i)).toBeInTheDocument();
      expect(screen.getByText(/Too many email attempts/i)).toBeInTheDocument();
    });
  });

  it("redirects authenticated users to admin", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });
});
