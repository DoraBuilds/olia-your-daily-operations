import { screen, fireEvent } from "@testing-library/react";
import Billing from "@/pages/Billing";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
import { renderWithProviders } from "../test-utils";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

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
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: null,
    teamMember: { id: "tm-1", organization_id: "org-1", name: "Test", email: "t@t.com", role: "Owner", location_ids: [], permissions: {} },
    loading: false,
    signOut: vi.fn(),
  }),
}));

const mockUsePlan = vi.fn();
const mockUseIsNativeApp = vi.fn().mockReturnValue(false);

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

vi.mock("@/hooks/useIsNativeApp", () => ({
  useIsNativeApp: () => mockUseIsNativeApp(),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: null, error: null });
  mockUseIsNativeApp.mockReturnValue(false);
  mockUsePlan.mockReturnValue({
    plan: "starter",
    planStatus: "active",
    org: null,
    isLoading: false,
    isActive: true,
    can: vi.fn().mockReturnValue(false),
    withinLimit: vi.fn().mockReturnValue(true),
    hasStripeSubscription: false,
    features: {
      maxLocations: 1,
      maxStaff: 15,
      maxChecklists: 10,
      aiBuilder: false,
      fileConvert: false,
      advancedReporting: false,
      exportPdf: true,
      exportCsv: false,
      multiLocation: false,
      prioritySupport: false,
    },
  });
});

describe("Billing page", () => {
  it("renders page title 'Billing'", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("renders current plan name (Starter)", () => {
    renderWithProviders(<Billing />);
    // PLAN_LABELS["starter"] = "Starter" — rendered multiple times (header + card)
    const labels = screen.getAllByText(PLAN_LABELS["starter"]);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a compact current plan summary", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Starter is active.")).toBeInTheDocument();
  });

  it("renders plan price cards for all 3 plans", () => {
    renderWithProviders(<Billing />);
    expect(screen.getAllByText(PLAN_LABELS["growth"]).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(PLAN_LABELS["enterprise"]).length).toBeGreaterThanOrEqual(1);
  });

  it("renders starter plan monthly price", () => {
    renderWithProviders(<Billing />);
    const starterPrice = `${PLAN_PRICES["starter"].currency}${PLAN_PRICES["starter"].monthly}`;
    expect(screen.getByText(starterPrice)).toBeInTheDocument();
  });

  it("renders growth plan monthly price", () => {
    renderWithProviders(<Billing />);
    const growthPrice = `${PLAN_PRICES["growth"].currency}${PLAN_PRICES["growth"].monthly}`;
    expect(screen.getByText(growthPrice)).toBeInTheDocument();
  });

  it("renders Monthly / Annual billing toggle buttons", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText(/Annual/i)).toBeInTheDocument();
  });

  it("switches to Annual billing when Annual button is clicked", () => {
    renderWithProviders(<Billing />);
    const annualBtn = screen.getByText(/Annual/i);
    fireEvent.click(annualBtn);
    // After switching, growth annual price should be shown
    const growthAnnualPrice = `${PLAN_PRICES["growth"].currency}${PLAN_PRICES["growth"].annual}`;
    expect(screen.getByText(growthAnnualPrice)).toBeInTheDocument();
  });

  it("renders 'Manage your plan' subtitle", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Manage your plan")).toBeInTheDocument();
  });

  it("shows 'Current' badge on the current plan card", () => {
    renderWithProviders(<Billing />);
    expect(screen.getAllByText("Current plan").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights Growth as the recommended plan", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("confirms the Stripe checkout session after redirect", () => {
    mockInvoke.mockResolvedValueOnce({ data: { synced: true }, error: null });
    renderWithProviders(<Billing />, {
      initialEntries: ["/billing?upgraded=1&session_id=cs_test_123"],
    });

    expect(mockInvoke).toHaveBeenCalledWith("confirm-checkout-session", {
      body: { sessionId: "cs_test_123" },
    });
  });

  it("shows an activation error when checkout confirmation fails", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: "Stripe sync failed." }, error: null });
    renderWithProviders(<Billing />, {
      initialEntries: ["/billing?upgraded=1&session_id=cs_test_456"],
    });

    expect(await screen.findByText("Stripe sync failed.")).toBeInTheDocument();
  });

  it("falls back to plan polling when confirm-checkout-session returns fnError", async () => {
    // Simulate edge function infrastructure error (not deployed / CORS failure)
    mockInvoke.mockResolvedValue({ data: null, error: { message: "FunctionNotFound" } });

    renderWithProviders(<Billing />, {
      initialEntries: ["/billing?upgraded=1&session_id=cs_infra_error"],
    });

    // Edge function was still called before falling through
    expect(mockInvoke).toHaveBeenCalledWith("confirm-checkout-session", {
      body: { sessionId: "cs_infra_error" },
    });

    // Activating banner is shown while polling
    expect(
      await screen.findByText(/activating your plan/i)
    ).toBeInTheDocument();
  });

  it("shows the activating banner immediately after checkout redirect", () => {
    // No session_id — falls to webhook-only path
    mockInvoke.mockResolvedValue({ data: null, error: null });
    renderWithProviders(<Billing />, {
      initialEntries: ["/billing?upgraded=1"],
    });

    // Should immediately show the "activating" spinner (plan is still starter)
    expect(screen.getByText(/activating your plan/i)).toBeInTheDocument();
  });

  it("renders growth plan when current plan is growth and shows Stripe link", () => {
    mockUsePlan.mockReturnValue({
      plan: "growth",
      planStatus: "active",
      org: { id: "org-1", plan: "growth", plan_status: "active", stripe_subscription_id: "sub_123" },
      isLoading: false,
      isActive: true,
      can: vi.fn().mockReturnValue(true),
      withinLimit: vi.fn().mockReturnValue(true),
      hasStripeSubscription: true,
      features: {
        maxLocations: 5,
        maxStaff: 100,
        maxChecklists: -1,
        aiBuilder: true,
        fileConvert: true,
        advancedReporting: true,
        exportPdf: true,
        exportCsv: true,
        multiLocation: true,
        prioritySupport: false,
      },
    });
    renderWithProviders(<Billing />);
    const growthElements = screen.getAllByText(PLAN_LABELS["growth"]);
    expect(growthElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Manage subscription on Stripe")).toBeInTheDocument();
  });

  describe("native (iOS/Android)", () => {
    beforeEach(() => { mockUseIsNativeApp.mockReturnValue(true); });

    it("shows current plan name instead of pricing page", () => {
      renderWithProviders(<Billing />);
      expect(screen.getByText("starter")).toBeInTheDocument();
    });

    it("shows 'Manage at olia.app' link", () => {
      renderWithProviders(<Billing />);
      expect(screen.getByText(/Manage at olia\.app/i)).toBeInTheDocument();
    });

    it("does not show any plan prices", () => {
      renderWithProviders(<Billing />);
      expect(screen.queryByText(/€49/)).not.toBeInTheDocument();
      expect(screen.queryByText(/€99/)).not.toBeInTheDocument();
    });

    it("does not show plan comparison table", () => {
      renderWithProviders(<Billing />);
      expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    });

    it("does not show Monthly / Annual toggle", () => {
      renderWithProviders(<Billing />);
      expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
    });
  });
});
