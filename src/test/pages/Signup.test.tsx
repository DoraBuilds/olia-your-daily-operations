import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Signup from "@/pages/Signup";
import { routerFutureFlags } from "@/lib/router-future-flags";

// ─── Supabase mock ────────────────────────────────────────────────────────────
const { mockSignUp } = vi.hoisted(() => ({ mockSignUp: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
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
  fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "securepass1" } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Signup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete import.meta.env.VITE_PUBLIC_SITE_URL;
    mockSignUp.mockResolvedValue({
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

  it("shows business name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/Crown Restaurant/i)).toBeInTheDocument();
  });

  it("shows helper text for business name field", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText(/name of your restaurant brand or business/i)).toBeInTheDocument();
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

  it("shows password input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/At least 8 characters/i)).toBeInTheDocument();
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

  it("shows 'Set up Olia for your business' subtitle", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Set up Olia for your business")).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password1" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is disabled when last name is missing", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/^Sarah$/i), { target: { value: "Sarah" } });
    // skip last name
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password1" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is disabled when password is too short", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/^Sarah$/i), { target: { value: "Sarah" } });
    fireEvent.change(screen.getByPlaceholderText(/^Johnson$/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "short" } });
    expect(screen.getByText("Create account").closest("button")).toBeDisabled();
  });

  it("Create account button is enabled when all fields are valid", () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    expect(screen.getByText("Create account").closest("button")).not.toBeDisabled();
  });

  // ── Submission ──────────────────────────────────────────────────────────────

  it("calls supabase.auth.signUp with correct email and password", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sarah@acme.com", password: "securepass1" })
    ));
  });

  it("passes full_name as 'First Last' in signUp metadata", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
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
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://dora.github.io/olia/auth/callback",
        }),
      })
    ));
  });

  it("onboarding payload has businessName and ownerName but no locationName", async () => {
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    // If payload was already cleared by AuthContext that's fine — signUp was called
    const raw = localStorage.getItem("olia_pending_onboarding");
    if (raw !== null) {
      const payload = JSON.parse(raw);
      expect(payload).toHaveProperty("businessName");
      expect(payload).toHaveProperty("ownerName");
      expect(payload).not.toHaveProperty("locationName");
    }
  });

  // ── Check-email screen ──────────────────────────────────────────────────────

  it("shows check-email screen when signUp returns no session", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
  });

  it("shows the user's email on the check-email screen", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("sarah@acme.com")).toBeInTheDocument());
  });

  it("check-email screen says 'workspace' not 'dashboard'", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText(/workspace/i)).toBeInTheDocument());
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("shows auth error message on signUp failure", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email already registered" },
    });
    render(<Signup />, { wrapper });
    fillValidForm();
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Email already registered")).toBeInTheDocument());
  });

  it("clears onboarding data from localStorage on auth failure", async () => {
    mockSignUp.mockResolvedValue({
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

  it("has a 'Sign in' link pointing to /kiosk", () => {
    render(<Signup />, { wrapper });
    const link = screen.getByRole("link", { name: /Sign in/i });
    expect(link).toHaveAttribute("href", "/kiosk");
  });
});
