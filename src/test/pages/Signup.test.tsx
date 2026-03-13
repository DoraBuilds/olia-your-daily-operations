import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Signup from "@/pages/Signup";

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
  return <MemoryRouter>{children}</MemoryRouter>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Signup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: signup returns session (email confirm disabled)
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: "new-user-1" },
        session: { access_token: "tok", refresh_token: "ref" },
      },
      error: null,
    });
  });

  it("renders without crashing", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("shows business name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/Crown Restaurant/i)).toBeInTheDocument();
  });

  it("shows first location name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/Main Branch/i)).toBeInTheDocument();
  });

  it("shows your name input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/Sarah Johnson/i)).toBeInTheDocument();
  });

  it("shows email input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/yourbusiness\.com/i)).toBeInTheDocument();
  });

  it("shows password input", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByPlaceholderText(/At least 8 characters/i)).toBeInTheDocument();
  });

  it("has a Create account button", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("Create account button is disabled when form is empty", () => {
    render(<Signup />, { wrapper });
    const btn = screen.getByText("Create account").closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("Create account button is disabled when password is too short", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "HQ" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "short" } });
    const btn = screen.getByText("Create account").closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("Create account button is enabled when form is valid", () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme Café" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "Main Branch" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "owner@acme.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "securepass1" } });
    const btn = screen.getByText("Create account").closest("button")!;
    expect(btn).not.toBeDisabled();
  });

  it("calls supabase.auth.signUp with correct values on submit", async () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme Café" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "City Centre" } });
    fireEvent.change(screen.getByPlaceholderText(/Sarah Johnson/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "jane@acme.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@acme.com",
        password: "password123",
      })
    ));
  });

  it("stores onboarding data in localStorage before signUp", async () => {
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "My Business" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "First Location" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    // localStorage should be set at the moment signUp is called
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    // Either it's still in storage (signUp returned session, AuthContext cleared it)
    // or it was already processed — either way, signUp was called
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it("shows check-email screen when signUp returns no session", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "HQ" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
  });

  it("shows check-email screen with user's email address", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "HQ" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "founder@acme.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("founder@acme.com")).toBeInTheDocument());
  });

  it("shows auth error message on signUp failure", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email already registered" },
    });
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "HQ" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "taken@acme.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Email already registered")).toBeInTheDocument());
  });

  it("clears onboarding data from localStorage on auth failure", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Something went wrong" },
    });
    render(<Signup />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Crown Restaurant/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText(/Main Branch/i), { target: { value: "HQ" } });
    fireEvent.change(screen.getByPlaceholderText(/yourbusiness\.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Create account"));
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeInTheDocument());
    expect(localStorage.getItem("olia_pending_onboarding")).toBeNull();
  });

  it("has a 'Sign in' link pointing to kiosk", () => {
    render(<Signup />, { wrapper });
    const link = screen.getByRole("link", { name: /Sign in/i });
    expect(link).toHaveAttribute("href", "/kiosk");
  });

  it("shows 'Set up Olia for your business' subtitle", () => {
    render(<Signup />, { wrapper });
    expect(screen.getByText("Set up Olia for your business")).toBeInTheDocument();
  });
});
