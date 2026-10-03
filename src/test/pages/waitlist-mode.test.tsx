import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { routerFutureFlags } from "@/lib/router-future-flags";

const { mockInsert, mockCapture, flag } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockCapture: vi.fn(),
  flag: { on: true },
}));

vi.mock("@/lib/waitlist-mode", () => ({
  get WAITLIST_MODE() { return flag.on; },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert })),
    functions: { invoke: vi.fn().mockResolvedValue({}) },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.mock("@/lib/posthog", () => ({ captureEvent: mockCapture }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, teamMember: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));

import { WaitlistModal } from "@/components/landing/WaitlistModal";
import SundayRemixSite from "@/pages/experiments/SundayRemixSite";
import Signup from "@/pages/Signup";

function renderModal() {
  const onClose = vi.fn();
  render(<WaitlistModal open onClose={onClose} />);
  return { onClose };
}

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
}

describe("WaitlistModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("inserts the trimmed email and shows the success state", async () => {
    renderModal();
    submitEmail("  jane@venue.com ");
    await waitFor(() => expect(screen.getByText("You're on the list!")).toBeInTheDocument());
    expect(mockInsert).toHaveBeenCalledWith({ email: "jane@venue.com", source: "landing" });
    expect(mockCapture).toHaveBeenCalledWith("waitlist_joined");
    expect(screen.getByText(/you'll hear from us very soon/i)).toBeInTheDocument();
  });

  it("shows a launch-emails-only consent line linking to the privacy policy", () => {
    renderModal();
    expect(screen.getByText(/only email you about Olia's launch/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  });

  it("is a centered pop-up on every width, not a bottom sheet", () => {
    renderModal();
    const overlay = screen.getByRole("dialog");
    expect(overlay.className).toContain("items-center");
    expect(overlay.className).not.toContain("items-end");
    expect(overlay.firstElementChild?.className).toContain("rounded-2xl");
    expect(overlay.firstElementChild?.className).not.toContain("rounded-t-2xl");
  });

  it("rejects an invalid email without calling Supabase", async () => {
    renderModal();
    submitEmail("not-an-email");
    expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("shows the same success state for a duplicate email (no enumeration)", async () => {
    mockInsert.mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } });
    renderModal();
    submitEmail("jane@venue.com");
    await waitFor(() => expect(screen.getByText("You're on the list!")).toBeInTheDocument());
    expect(screen.queryByText(/duplicate|already/i)).not.toBeInTheDocument();
  });

  it("shows an error for any other failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { code: "500", message: "boom" } });
    renderModal();
    submitEmail("jane@venue.com");
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe("landing page CTAs", () => {
  function renderLanding() {
    return render(
      <MemoryRouter future={routerFutureFlags}>
        <SundayRemixSite />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    flag.on = true;
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("with waitlist mode on: no /signup links, no nav Sign in, and CTAs open the modal", () => {
    renderLanding();
    expect(document.querySelectorAll('a[href="/signup"]')).toHaveLength(0);
    // the only /login link left is the quiet footer one
    const loginLinks = document.querySelectorAll('a[href="/login"]');
    expect(loginLinks).toHaveLength(1);
    expect(loginLinks[0].closest("footer")).not.toBeNull();

    // waitlist-mode copy
    expect(screen.getByText(/Opening soon · from €79/)).toBeInTheDocument();
    expect(screen.getByText(/Join the waitlist and be among the first to run every shift/)).toBeInTheDocument();
    expect(screen.getByText("When can I start?")).toBeInTheDocument();
    expect(screen.queryByText(/Set up your first checklist today/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no account to create/)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Join the waitlist →")[0]);
    expect(screen.getByRole("dialog", { name: "Join the waitlist" })).toBeInTheDocument();
  });

  it("has no demo anywhere; the floating button says Join and opens the waitlist", () => {
    renderLanding();
    expect(document.body.textContent).not.toMatch(/demo/i);
    expect(screen.queryByText("Try it now")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact sales")).not.toBeInTheDocument();
    expect(screen.getByText("Made by hospitality people, for hospitality people")).toBeInTheDocument();
    expect(screen.queryByText("Live in many kitchens")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Join", { selector: "a.rx-float-btn" }));
    expect(screen.getByRole("dialog", { name: "Join the waitlist" })).toBeInTheDocument();
  });

  it("with waitlist mode off: the original sign up / sign in links are back", () => {
    flag.on = false;
    renderLanding();
    expect(document.querySelectorAll('a[href="/signup"]').length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(1);
    expect(screen.queryByText("Join the waitlist")).not.toBeInTheDocument();
    // flag-off copy is exactly as before
    expect(screen.getByText(/Starter from €79/)).toBeInTheDocument();
    expect(screen.getByText(/Set up your first checklist today. Most venues are running in under an hour./)).toBeInTheDocument();
    expect(screen.queryByText("When can I start?")).not.toBeInTheDocument();
    expect(screen.getByText(/no account to create/)).toBeInTheDocument();
  });
});

describe("/signup in waitlist mode", () => {
  function renderSignup(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]} future={routerFutureFlags}>
        <Routes>
          <Route path="/" element={<div>landing page</div>} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => { flag.on = true; });

  it("redirects to the landing page", () => {
    renderSignup("/signup");
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("shows a closed notice (and no sign-up form) for the account-reset recovery link", () => {
    renderSignup("/signup?reason=account-reset&detail=Please%20sign%20up%20again");
    expect(screen.queryByText("landing page")).not.toBeInTheDocument();
    expect(screen.getByText("Sign-ups aren't open yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Please sign up again")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/");
  });

  it("shows no sign-up form after an account deletion either", () => {
    renderSignup("/signup?reason=account-deleted");
    expect(screen.getByText("Your account has been deleted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
  });

  it("does not redirect when waitlist mode is off", () => {
    flag.on = false;
    renderSignup("/signup");
    expect(screen.queryByText("landing page")).not.toBeInTheDocument();
  });
});
