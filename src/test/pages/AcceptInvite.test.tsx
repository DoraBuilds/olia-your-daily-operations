import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AcceptInvite from "@/pages/AcceptInvite";

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp     = vi.fn();
const mockRpc           = vi.fn();
const mockNavigate      = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: any[]) => mockSignInWithOtp(...args),
      verifyOtp:     (...args: any[]) => mockVerifyOtp(...args),
    },
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

const mockRetrySetup = vi.fn();
const mockSignOut = vi.fn();
let authState: { user: { id: string; email: string } | null; teamMember: unknown } = { user: null, teamMember: null };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...authState, retrySetup: mockRetrySetup, signOut: mockSignOut }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfig: () => ({ publicSiteUrl: "https://example.com" }),
}));

vi.mock("@/lib/github-pages-routing", () => ({
  buildPublicAuthRedirectUrl: (_base: string, path: string) => `https://example.com${path}`,
}));

function renderAcceptInvite(token = "valid-token") {
  return render(
    <MemoryRouter initialEntries={[`/accept-invite?token=${token}`]}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvite />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({
    data: { valid: true, email: "manager@example.com", organization_name: "Rooftop Bar" },
    error: null,
  });
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  localStorage.clear();
  authState = { user: null, teamMember: null };
});

describe("AcceptInvite page", () => {
  it("shows a loading spinner initially", () => {
    mockRpc.mockReturnValue(new Promise(() => {})); // never resolves
    renderAcceptInvite();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("calls validate_invite_token with the URL token", async () => {
    renderAcceptInvite("abc-token");
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("validate_invite_token", { p_token: "abc-token" }));
  });

  it("shows the welcome screen with org name after a valid token", async () => {
    renderAcceptInvite();
    await waitFor(() => expect(screen.getByText("You're invited!")).toBeInTheDocument());
    expect(screen.getByText(/Rooftop Bar/)).toBeInTheDocument();
    expect(screen.getByText("manager@example.com")).toBeInTheDocument();
  });

  it("shows an error screen for an invalid token", async () => {
    mockRpc.mockResolvedValue({ data: { valid: false }, error: null });
    renderAcceptInvite("bad-token");
    await waitFor(() => expect(screen.getByText("Invite not found")).toBeInTheDocument());
  });

  it("shows an error screen when token is missing from URL", async () => {
    render(
      <MemoryRouter initialEntries={["/accept-invite"]}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Invite not found")).toBeInTheDocument());
  });

  it("clicking 'Accept invitation' stores token in localStorage and sends OTP", async () => {
    renderAcceptInvite("my-token");
    await waitFor(() => screen.getByText("Accept invitation"));

    await act(async () => {
      fireEvent.click(screen.getByText("Accept invitation"));
    });

    expect(localStorage.getItem("olia_pending_invite_token")).toBe("my-token");
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "manager@example.com",
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
  });

  it("shows the code entry step after OTP is sent", async () => {
    renderAcceptInvite();
    await waitFor(() => screen.getByText("Accept invitation"));

    await act(async () => {
      fireEvent.click(screen.getByText("Accept invitation"));
    });

    await waitFor(() => expect(screen.getByPlaceholderText("Enter your code")).toBeInTheDocument());
  });

  it("calls verifyOtp when code is entered and Verify button clicked", async () => {
    renderAcceptInvite();
    await waitFor(() => screen.getByText("Accept invitation"));
    await act(async () => { fireEvent.click(screen.getByText("Accept invitation")); });
    await waitFor(() => screen.getByPlaceholderText("Enter your code"));

    fireEvent.change(screen.getByPlaceholderText("Enter your code"), { target: { value: "12345678" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Verify & sign in"));
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "manager@example.com",
      token: "12345678",
      type: "email",
    });
  });

  it("shows error message when OTP verification fails", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "Invalid OTP" } });

    renderAcceptInvite();
    await waitFor(() => screen.getByText("Accept invitation"));
    await act(async () => { fireEvent.click(screen.getByText("Accept invitation")); });
    await waitFor(() => screen.getByPlaceholderText("Enter your code"));

    fireEvent.change(screen.getByPlaceholderText("Enter your code"), { target: { value: "00000000" } });
    await act(async () => { fireEvent.click(screen.getByText("Verify & sign in")); });

    await waitFor(() => expect(screen.getByText("Invalid OTP")).toBeInTheDocument());
  });

  it("removes pending invite token from localStorage when OTP send fails", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: "Something went wrong" } });

    renderAcceptInvite("fail-token");
    await waitFor(() => screen.getByText("Accept invitation"));

    await act(async () => { fireEvent.click(screen.getByText("Accept invitation")); });

    await waitFor(() => expect(localStorage.getItem("olia_pending_invite_token")).toBeNull());
  });

  it("accepts the invite for an already signed-in matching account instead of bouncing to the dashboard", async () => {
    authState = { user: { id: "u1", email: "Manager@Example.com" }, teamMember: null };
    mockRpc.mockImplementation(async (name: string) =>
      name === "accept_invite"
        ? { data: { success: true }, error: null }
        : { data: { valid: true, email: "manager@example.com", organization_name: "Rooftop Bar" }, error: null });

    renderAcceptInvite("tok");

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("accept_invite", { p_token: "tok" }));
    await waitFor(() => expect(mockRetrySetup).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("asks a signed-in user with a different email to sign out", async () => {
    authState = { user: { id: "u1", email: "other@example.com" }, teamMember: null };

    renderAcceptInvite();

    await waitFor(() => expect(screen.getByText(/but this invitation is for manager@example.com/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Sign out and continue"));
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith("accept_invite", expect.anything());
  });

  it("goes to /dashboard when the signed-in user already belongs to an org", async () => {
    authState = { user: { id: "u1", email: "manager@example.com" }, teamMember: { id: "u1" } };

    renderAcceptInvite();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });
});
