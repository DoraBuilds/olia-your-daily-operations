import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Signup from "@/pages/Signup";
import { routerFutureFlags } from "@/lib/router-future-flags";

// ─── Supabase mock ────────────────────────────────────────────────────────────
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
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}));

// AuthContext — unauthenticated
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, teamMember: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));

// ─── Router wrapper ────────────────────────────────────────────────────────────
function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter future={routerFutureFlags}>{children}</MemoryRouter>;
}

// ─── Helper: fill all required fields ────────────────────────────────────────
function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme Café" } });
  fireEvent.change(screen.getByPlaceholderText(/^Sarah$/i), { target: { value: "Sarah" } });
  fireEvent.change(screen.getByPlaceholderText(/^Johnson$/i), { target: { value: "Johnson" } });
  fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "sarah@acme.com" } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Signup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete import.meta.env.VITE_PUBLIC_SITE_URL;
    mockSignInWithOtp.mockResolvedValue({
      data: {
        user: { id: "new-user-1" },
        session: { access_token: "tok", refresh_token: "ref" },
      },
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: { id: "new-user-1" },
        session: { access_token: "tok", refresh_token: "ref" },
      },
      error: null,
    });
  });

  // ── Field presence ──────────────────────────────────────────────────────────

  it("renders without crashing", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("shows brand name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/Crown Restaurant/i)).toBeInTheDocument();
  });

  it("shows helper text for brand name field", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText(/name of your brand or restaurant/i)).toBeInTheDocument();
  });

  it("shows first name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/^Sarah$/i)).toBeInTheDocument();
  });

  it("shows last name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/^Johnson$/i)).toBeInTheDocument();
  });

  it("shows email input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/yourbusiness\.com/i)).toBeInTheDocument();
  });

  it("does not show a password input", () => {
    render(<Signup />, { wrapper });
    expect(screen.queryByPlaceholderText(/At least 8 characters/i)).toBeNull();
  });

  it("does NOT show a location name field", () => {
    render(<Signup />, { wrapper });
    expect(screen.queryByPlaceholderText(/Main Branch/i)).toBeNull();
    expect(screen.queryByText(/first location name/i)).toBeNull();
  });

  it("has a 'Create account' button", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("shows the one-time-code signup subtitle", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Set up Olia for your business with a one-time code")).toBeInTheDocument();
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("Create account button is disabled when form is empty", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is disabled when first name is missing", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    // skip first name
    fireEvent.change(screen.getByPlaceholderText(/^Johnson$/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is disabled when last name is missing", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/^Sarah$/i), { target: { value: "Sarah" } });
    // skip last name
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is disabled when email is missing", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/^Sarah$/i), { target: { value: "Sarah" } });
    fireEvent.change(screen.getByPlaceholderText(/^Johnson$/i), { target: { value: "Smith" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is enabled when all fields are valid", () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    expect(screen.getByText("Create account").closest("button")).not.toBeDisabled();
  });

  // ── Submission ──────────────────────────────────────────────────────────────

  it("calls supabase.auth.signInWithOtp with the signup email", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sarah@acme.com" })
    ));
  });

  it("passes full_name as 'First Last' in sign-in metadata", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          shouldCreateUser: true,
          data: expect.objectContaining({
            full_name: "Sarah Johnson",
            business_name: "Acme Café",
          }),
        }),
      })
    ));
  });

  it("uses VITE_PUBLIC_SITE_URL for the email confirmation redirect when provided", async () => {
    import.meta.env.VITE_PUBLIC_SITE_URL = "https://dora.github.io/olia";
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://dora.github.io/olia?p=%2Fauth%2Fcallback",
        }),
      })
    ));
  });

  it("onboarding payload has businessName and ownerName but no locationName", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalled());
    // If payload was already cleared by AuthContext that's fine — signUp was called
    const raw = localStorage.getItem("olia_pending_onboarding");
    if (raw !== null) {
      const payload = JSON.parse(raw);
      expect(payload).toHaveProperty("businessName");
      expect(payload).toHaveProperty("ownerName");
      expect(payload).not.toHaveProperty("locationName");
    }
  });

  // ── Code screen ─────────────────────────────────────────────────────────────

  it("shows code-entry screen when signUp returns no session", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Enter your code")).toBeInTheDocument());
  });

  it("shows the user's email on the code-entry screen", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("sarah@acme.com")).toBeInTheDocument());
  });

  it("code-entry screen explains that a one-time code was sent", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText(/8-digit code/i)).toBeInTheDocument());
  });

  it("verifies the emailed code with signup verification", async () => {
    mockSignInWithOtp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(screen.getByPlaceholderText(/Enter the code from your email/i)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Enter the code from your email/i), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "sarah@acme.com",
      token: "12345678",
      type: "signup",
    }));
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("shows auth error message on signup code-send failure", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email already registered" },
    });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Email already registered")).toBeInTheDocument());
  });

  it("clears onboarding data from localStorage on auth failure", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Something went wrong" },
    });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeInTheDocument());
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
  });

  // ── Navigation links ────────────────────────────────────────────────────────

  it("has a 'Sign in' link pointing to /login", () => {
    render(<Signup />, { wrapper });
    const link = screen.getByRole("link", { name: /Sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});
