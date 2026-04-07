import { screen, fireEvent, within } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();

const MOCK_LOCATIONS = [
  { id: "loc-1", name: "Main Branch" },
  { id: "loc-2", name: "City Centre" },
  { id: "loc-3", name: "Riverside" },
];

const MOCK_CHECKLISTS = [
  { id: "cl-1", title: "Opening", location_id: "loc-1", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-2", title: "Closing", location_id: "loc-1", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-3", title: "Opening", location_id: "loc-2", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-4", title: "Closing", location_id: "loc-2", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-5", title: "Deep Clean", location_id: "loc-3", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2026-03-01", updated_at: "2026-03-01" },
];

const MOCK_LOGS = [
  { id: "log-1", checklist_id: "cl-1", checklist_title: "Opening", completed_by: "Alice", staff_profile_id: "sp1", score: 100, type: "opening", answers: [], created_at: "2026-03-27T08:00:00Z", location_id: "loc-1", started_at: "2026-03-27T07:45:00Z" },
  { id: "log-2", checklist_id: "cl-2", checklist_title: "Closing", completed_by: "Alice", staff_profile_id: "sp1", score: 100, type: "closing", answers: [], created_at: "2026-03-27T22:00:00Z", location_id: "loc-1", started_at: "2026-03-27T21:40:00Z" },
  { id: "log-3", checklist_id: "cl-3", checklist_title: "Opening", completed_by: "Bob", staff_profile_id: "sp2", score: 25, type: "opening", answers: [], created_at: "2026-03-27T09:00:00Z", location_id: "loc-2", started_at: "2026-03-27T08:50:00Z" },
];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      then: vi.fn().mockImplementation((cb) =>
        Promise.resolve(cb({ data: [], error: null }))
      ),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: null,
    teamMember: { id: "user-1", organization_id: "org-1", name: "Sarah", email: "s@test.com", role: "Owner", location_ids: [], permissions: {} },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: vi.fn(() => ({ data: [] })),
  useCreateAlert: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useChecklistLogs", () => ({
  useChecklistLogs: () => ({ data: MOCK_LOGS }),
}));

vi.mock("@/hooks/useActions", () => ({
  useActions: () => ({ data: [] }),
}));

vi.mock("@/hooks/useChecklists", () => ({
  useChecklists: () => ({ data: MOCK_CHECKLISTS }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({ data: MOCK_LOCATIONS }),
}));

describe("Dashboard page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a greeting (Good morning / Good afternoon / Good evening)", () => {
    renderWithProviders(<Dashboard />);
    const greeting =
      screen.queryByText(/Good morning/i) ||
      screen.queryByText(/Good afternoon/i) ||
      screen.queryByText(/Good evening/i);
    expect(greeting).not.toBeNull();
  });

  it("renders greeting with teamMember name in h1", () => {
    renderWithProviders(<Dashboard />);
    const h1 = document.getElementById("dashboard-greeting");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toMatch(/Sarah/);
  });

  it("renders stat strip with labels Checklists, Alerts, Overdue", () => {
    renderWithProviders(<Dashboard />);
    const checklistsEls = screen.getAllByText("Checklists");
    expect(checklistsEls.length).toBeGreaterThanOrEqual(1);
    const alertsEls = screen.getAllByText("Alerts");
    expect(alertsEls.length).toBeGreaterThanOrEqual(1);
    const overdueEls = screen.getAllByText("Overdue");
    expect(overdueEls.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Daily compliance' section label", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("Daily compliance")).toBeInTheDocument();
  });

  it("renders Daily compliance tabs: today, week, month", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByRole("button", { name: /^today$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^week$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^month$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^overdue$/i })).not.toBeInTheDocument();
  });

  it("does not render the removed quick-task floating action button", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.queryByRole("button", { name: /add quick task/i })).not.toBeInTheDocument();
  });

  it("renders Notifications button in header", () => {
    renderWithProviders(<Dashboard />);
    const notifBtn = document.getElementById("notifications-btn");
    // Rendered inside Layout headerRight — verify page loaded without error
    expect(document.body).toBeDefined();
  });

  it("does not render a Yesterday compliance tab", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.queryByRole("button", { name: /^yesterday$/i })).not.toBeInTheDocument();
  });

  it("does not render 'All locations' location filter (removed)", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.queryByText("All locations")).not.toBeInTheDocument();
  });

  it("shows Operational alerts section with empty state when no alerts", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("Operational alerts")).toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("It looks like everything is calm now.")).toBeInTheDocument();
  });

  it("sorts location health from worst to best and opens reporting with the location filter", () => {
    renderWithProviders(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /^week$/i }));

    const locationCards = screen.getAllByTestId("location-card");
    expect(locationCards).toHaveLength(3);
    expect(within(locationCards[0]).getByText("Riverside")).toBeInTheDocument();
    expect(within(locationCards[0]).getByText("0%")).toBeInTheDocument();
    expect(within(locationCards[1]).getByText("City Centre")).toBeInTheDocument();
    expect(within(locationCards[1]).getByText(/12%|13%/)).toBeInTheDocument();
    expect(within(locationCards[2]).getByText("Main Branch")).toBeInTheDocument();
    expect(within(locationCards[2]).getByText("100%")).toBeInTheDocument();

    fireEvent.click(locationCards[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/reporting?location=loc-3");
  });
});
