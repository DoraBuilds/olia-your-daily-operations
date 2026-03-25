import { screen, fireEvent } from "@testing-library/react";
import Billing from "@/pages/Billing";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
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
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
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

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

beforeEach(() => {
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

  it("renders 'Current plan' section label", () => {
    renderWithProviders(<Billing />);
    expect(screen.getByText("Your current plan")).toBeInTheDocument();
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
    // Multiple "Growth" elements exist - use getAllByText
    const growthElements = screen.getAllByText(PLAN_LABELS["growth"]);
    expect(growthElements.length).toBeGreaterThanOrEqual(1);
    // Should show manage subscription link
    expect(screen.getByText("Manage subscription on Stripe")).toBeInTheDocument();
  });
});
