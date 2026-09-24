import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/Login";

const { mockSignInWithOtp, mockVerifyOtp, mockRpc } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockRpc: vi.fn(),
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
    rpc: mockRpc,
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

function renderPage(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByText("You'll receive a one-time code at the email address you enter.")).toBeInTheDocument();
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

  it("verifies the emailed code and navigates to admin via the user effect", async () => {
    // Navigation now happens through useEffect(user → navigate) to avoid racing
    // ProtectedRoute. Simulate: OTP succeeds → useAuth returns a user → effect fires.
    const { rerender } = renderPage();
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

    // Simulate AuthContext setting user after SIGNED_IN — triggers the useEffect
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    rerender(<MemoryRouter><Login /></MemoryRouter>);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true }));
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

  it("shows a friendly create-account message when the email has no sign-in account yet", async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp" },
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText("you@yourbusiness.com"), {
      target: { value: "owner@olia.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByText(/No Olia account was found/i)).toBeInTheDocument();
      // Points invitees back to their invite email instead of just "create one" —
      // creating a new account here would spin up an unrelated organisation.
      expect(screen.getByText(/use the invite link from that email instead/i)).toBeInTheDocument();
      expect(screen.queryByText(/signups not allowed for otp/i)).not.toBeInTheDocument();
    });
  });

  it("redirects authenticated users to admin", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });

  describe("Kiosk tab (#861)", () => {
    beforeEach(() => localStorage.clear());

    it("opens straight onto the Kiosk tab from /login?tab=kiosk", () => {
      renderPage("/login?tab=kiosk");
      expect(screen.getByRole("tab", { name: "Kiosk" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Kiosk code")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("you@yourbusiness.com")).not.toBeInTheDocument();
    });

    it("switches between Log in and Kiosk", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "Kiosk" }));
      expect(screen.getByLabelText("Kiosk code")).toBeInTheDocument();
      expect(screen.getByText("Enter the kiosk code from Olia Admin.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
      expect(screen.getByPlaceholderText("you@yourbusiness.com")).toBeInTheDocument();
    });

    it("formats the code as it's typed and only enables Start once it's complete", () => {
      renderPage("/login?tab=kiosk");
      const input = screen.getByLabelText("Kiosk code");
      fireEvent.change(input, { target: { value: "abcd2" } });
      expect(input).toHaveValue("ABCD-2");
      expect(screen.getByRole("button", { name: "Start kiosk" })).toBeDisabled();
      fireEvent.change(input, { target: { value: "abcd2345" } });
      expect(input).toHaveValue("ABCD-2345");
      expect(screen.getByRole("button", { name: "Start kiosk" })).toBeEnabled();
    });

    it("pairs this browser and opens the kiosk", async () => {
      mockRpc.mockResolvedValue({
        data: [{ device_id: "d1", device_token: "t1", device_label: "Bar", location_id: "l1", location_name: "Downtown", kiosk_token: "k1" }],
        error: null,
      });
      renderPage("/login?tab=kiosk");
      fireEvent.change(screen.getByLabelText("Kiosk code"), { target: { value: "ABCD-2345" } });
      fireEvent.click(screen.getByRole("button", { name: "Start kiosk" }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/kiosk", { replace: true }));
      expect(mockRpc).toHaveBeenCalledWith("pair_kiosk_device", { p_code: "ABCD2345" });
      expect(localStorage.getItem("kiosk_location_id")).toBe("l1");
    });

    it("explains a used or wrong code", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      renderPage("/login?tab=kiosk");
      fireEvent.change(screen.getByLabelText("Kiosk code"), { target: { value: "ABCD2345" } });
      fireEvent.click(screen.getByRole("button", { name: "Start kiosk" }));
      expect(await screen.findByText(/That code isn't valid/)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith("/kiosk", expect.anything());
    });

    it("reports a connection problem separately", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
      renderPage("/login?tab=kiosk");
      fireEvent.change(screen.getByLabelText("Kiosk code"), { target: { value: "ABCD2345" } });
      fireEvent.click(screen.getByRole("button", { name: "Start kiosk" }));
      expect(await screen.findByText(/Couldn't reach Olia/)).toBeInTheDocument();
    });
  });
});
