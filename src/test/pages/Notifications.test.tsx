import { screen, fireEvent } from "@testing-library/react";
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
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: null,
    teamMember: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Mutable state for what the hooks return — updated in each test
const alertsState = { data: [] as any[], isLoading: false };
const dismissState = { mutate: vi.fn() as any, isPending: false };
const clearState = { mutate: vi.fn() as any, isPending: false };

vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: vi.fn(() => alertsState),
  useDismissAlert: vi.fn(() => dismissState),
  useClearAlerts: vi.fn(() => clearState),
}));

// Import Notifications after the mocks are set up
import Notifications from "@/pages/Notifications";

describe("Notifications page", () => {
  beforeEach(() => {
    alertsState.data = [];
    alertsState.isLoading = false;
    dismissState.mutate = vi.fn();
    clearState.mutate = vi.fn();
  });

  it("renders 'All clear' when no alerts", () => {
    renderWithProviders(<Notifications />);
    expect(screen.getByText("All clear")).toBeInTheDocument();
  });

  it("shows 0 alerts count label", () => {
    renderWithProviders(<Notifications />);
    expect(screen.getByText(/0 alert/i)).toBeInTheDocument();
  });

  it("does NOT show 'Clear all' button when alerts is empty", () => {
    renderWithProviders(<Notifications />);
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();
  });

  it("renders alerts when useAlerts returns data", () => {
    alertsState.data = [
      {
        id: "a-1",
        type: "warn",
        message: "Fridge temperature high",
        area: "Kitchen",
        time: "09:00",
        source: "checklist",
        dismissed_at: null,
        created_at: "2026-03-09T09:00:00Z",
      },
    ];
    renderWithProviders(<Notifications />);
    expect(screen.getByText("Fridge temperature high")).toBeInTheDocument();
  });

  it("shows 'Clear all' button when there are alerts", () => {
    alertsState.data = [
      {
        id: "a-1",
        type: "error",
        message: "Test alert",
        area: "Bar",
        time: null,
        source: null,
        dismissed_at: null,
        created_at: "2026-03-09T09:00:00Z",
      },
    ];
    renderWithProviders(<Notifications />);
    expect(screen.getByText(/clear all/i)).toBeInTheDocument();
  });

  it("calls dismissMut.mutate when dismiss button clicked", () => {
    const dismissMutate = vi.fn();
    dismissState.mutate = dismissMutate;
    alertsState.data = [
      {
        id: "a-1",
        type: "warn",
        message: "Alert message",
        area: "Kitchen",
        time: null,
        source: null,
        dismissed_at: null,
        created_at: "2026-03-09T09:00:00Z",
      },
    ];
    renderWithProviders(<Notifications />);
    const dismissBtn = screen.getByLabelText("Dismiss alert");
    fireEvent.click(dismissBtn);
    expect(dismissMutate).toHaveBeenCalledWith("a-1");
  });

  it("renders Notifications page title", () => {
    renderWithProviders(<Notifications />);
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("renders subtitle 'Active operational alerts'", () => {
    renderWithProviders(<Notifications />);
    expect(screen.getByText("Active operational alerts")).toBeInTheDocument();
  });

  it("shows correct count when multiple alerts", () => {
    alertsState.data = [
      { id: "a-1", type: "warn", message: "Alert 1", area: "Kitchen", time: null, source: null, dismissed_at: null, created_at: "2026-03-09T09:00:00Z" },
      { id: "a-2", type: "error", message: "Alert 2", area: "Bar", time: null, source: null, dismissed_at: null, created_at: "2026-03-09T09:01:00Z" },
    ];
    renderWithProviders(<Notifications />);
    expect(screen.getByText(/2 alert/i)).toBeInTheDocument();
  });
});
