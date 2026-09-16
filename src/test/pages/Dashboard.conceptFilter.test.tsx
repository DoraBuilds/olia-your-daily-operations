/**
 * Concept-scoping coverage for Dashboard — verifies the sidebar's concept
 * dropdown (ConceptFilterContext.scopedLocationIds) actually narrows what the
 * Dashboard shows:
 *  - only compliance cards for in-scope locations render
 *  - the top "Checklists" stat only counts logs from in-scope locations
 *  - checklists with no location assignment (org-wide) still count even when scoped
 */
import { screen, within } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";
import { renderWithProviders } from "../test-utils";

const conceptFilterState: { scopedLocationIds: string[] | null } = { scopedLocationIds: null };

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [],
    selectedConceptId: "all",
    setSelectedConceptId: () => {},
    scopedLocationIds: conceptFilterState.scopedLocationIds,
  }),
}));

const mockNavigate = vi.fn();

const MOCK_LOCATIONS = [
  { id: "loc-1", name: "Main Branch" },
  { id: "loc-2", name: "City Centre" },
];

const MOCK_CHECKLISTS = [
  { id: "cl-1", title: "Opening", location_id: "loc-1", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, is_published: true, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-2", title: "Closing", location_id: "loc-2", location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, is_published: true, created_at: "2026-03-01", updated_at: "2026-03-01" },
  { id: "cl-3", title: "Org-wide Safety Check", location_id: null, location_ids: null, schedule: null, sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, is_published: true, created_at: "2026-03-01", updated_at: "2026-03-01" },
];

const MOCK_LOGS = [
  { id: "log-1", checklist_id: "cl-1", checklist_title: "Opening", completed_by: "Alice", staff_profile_id: "sp1", score: 100, type: "opening", answers: [], created_at: "2026-03-27T08:00:00Z", location_id: "loc-1", started_at: "2026-03-27T07:45:00Z" },
  { id: "log-2", checklist_id: "cl-2", checklist_title: "Closing", completed_by: "Bob", staff_profile_id: "sp2", score: 90, type: "closing", answers: [], created_at: "2026-03-27T09:00:00Z", location_id: "loc-2", started_at: "2026-03-27T08:50:00Z" },
];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
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
  useAlerts: () => ({ data: [] }),
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

describe("Dashboard concept scoping", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    conceptFilterState.scopedLocationIds = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a compliance card for every location when no concept is selected", () => {
    renderWithProviders(<Dashboard />);
    const cards = screen.getAllByTestId("location-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.getByText("City Centre")).toBeInTheDocument();
  });

  it("only shows compliance cards for locations within the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Dashboard />);
    const cards = screen.getAllByTestId("location-card");
    expect(cards).toHaveLength(1);
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.queryByText("City Centre")).not.toBeInTheDocument();
  });

  it("only counts today's checklists stat from in-scope locations", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Dashboard />);
    // Both logs are dated today, but only log-1 (loc-1) is in scope.
    const statButton = screen.getByRole("button", { name: "View checklist reporting" });
    expect(within(statButton).getByText("1")).toBeInTheDocument();
  });

  it("still counts an org-wide (unassigned) checklist toward the one remaining location's card", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Dashboard />);
    // Main Branch gets cl-1 (assigned, completed via log-1) + cl-3 (unassigned,
    // not completed) = 2 checklists assigned, 1 completed.
    expect(screen.getByText("1/2 checklists completed")).toBeInTheDocument();
  });
});
