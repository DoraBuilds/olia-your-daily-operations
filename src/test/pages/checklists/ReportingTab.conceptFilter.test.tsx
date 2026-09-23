/**
 * Concept/location/department scoping coverage for ReportingTab's own filter
 * panel (MultiSelectFilter) — these filters are local to Reporting and no
 * longer depend on the sidebar's global concept switcher. Verifies:
 *  - the concept filter narrows the location picker's options
 *  - selecting a concept narrows completion-log entries and unstarted checklists
 *  - an org-wide (unassigned) unstarted checklist stays visible when scoped
 *  - the department filter narrows logs by the completing checklist's departments
 *  - stale location/department picks are pruned, but not while their lists are still loading
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ReportingTab } from "@/pages/checklists/ReportingTab";
import { routerFutureFlags } from "@/lib/router-future-flags";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1", organization_id: "org1", name: "Sarah", email: "s@test.com",
      role: "Owner", location_ids: [], permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/export-utils", () => ({
  exportReportingPdf: vi.fn(),
  exportReportingCsv: vi.fn(),
  exportLogDetailPdf: vi.fn(),
}));

const MOCK_LOGS = [
  {
    id: "l1", checklist_id: "c1", checklist_title: "Opening Checklist",
    completed_by: "Alice", staff_profile_id: "sp1", score: 90, type: "opening",
    answers: [], created_at: "2024-03-09T08:00:00Z", started_at: "2024-03-09T07:45:00Z",
    location_id: "loc-1",
  },
  {
    id: "l2", checklist_id: "c2", checklist_title: "Closing Checklist",
    completed_by: "Bob", staff_profile_id: "sp2", score: 80, type: "closing",
    answers: [], created_at: "2024-03-09T22:00:00Z", started_at: "2024-03-09T21:40:00Z",
    location_id: "loc-2",
  },
];

vi.mock("@/hooks/useChecklistLogs", () => ({
  useChecklistLogs: () => ({ data: MOCK_LOGS, isLoading: false }),
  useCreateChecklistLog: () => ({ mutate: vi.fn() }),
}));

// c1 (loc-1, dept-kitchen) has a log → completed, not unstarted.
// c2 (loc-2, dept-bar) has no log → unstarted, should disappear once scoped to Concept A / loc-1.
// c3 (no location, no department) has no log → unstarted, should stay visible even when scoped.
const MOCK_CHECKLISTS = [
  { id: "c1", title: "Opening Checklist", location_id: "loc-1", location_ids: null, department_ids: ["dept-kitchen"], start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "morning", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "c2", title: "Closing Checklist", location_id: "loc-2", location_ids: null, department_ids: ["dept-bar"], start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "evening", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "c3", title: "Org Wide Checklist", location_id: null, location_ids: null, department_ids: null, start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
];

vi.mock("@/hooks/useChecklists", () => ({
  useChecklists: () => ({ data: MOCK_CHECKLISTS, isLoading: false }),
  useFolders: () => ({ data: [], isLoading: false }),
  useSaveChecklist: () => ({ mutate: vi.fn() }),
  useDeleteChecklist: () => ({ mutate: vi.fn() }),
  useSaveFolder: () => ({ mutate: vi.fn() }),
  useDeleteFolder: () => ({ mutate: vi.fn() }),
  useReorderFolders: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useActions", () => ({
  useActions: () => ({ data: [], isLoading: false }),
  useCreateAction: () => ({ mutate: vi.fn() }),
  useUpdateAction: () => ({ mutate: vi.fn() }),
}));

// Mutable so tests can simulate the locations / departments queries still loading.
const queryState = { locationsLoaded: true, departmentsFetching: false };

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => queryState.locationsLoaded
    ? {
        data: [
          { id: "loc-1", name: "Main Branch", concept_id: "concept-a" },
          { id: "loc-2", name: "Terrace", concept_id: "concept-b" },
        ],
        isLoading: false,
        isSuccess: true,
      }
    : { data: undefined, isLoading: true, isSuccess: false },
}));

vi.mock("@/hooks/useConcepts", () => ({
  useConcepts: () => ({
    data: [
      { id: "concept-a", name: "Concept A" },
      { id: "concept-b", name: "Concept B" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useDepartments", () => ({
  useDepartmentsForLocations: (locationIds: string[]) => queryState.departmentsFetching
    ? { data: undefined, isLoading: true, isFetching: true }
    : {
        data: [
          { id: "dept-kitchen", location_id: "loc-1", name: "Kitchen" },
          { id: "dept-bar", location_id: "loc-2", name: "Bar" },
        ].filter(d => locationIds.includes(d.location_id)),
        isLoading: false,
        isFetching: false,
      },
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    features: {},
  }),
}));

vi.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  ReferenceLine: () => null,
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter future={routerFutureFlags}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function selectConceptA() {
  fireEvent.click(screen.getByTestId("reporting-concept-filter-trigger"));
  fireEvent.click(screen.getByTestId("reporting-concept-filter-option-concept-a"));
}

describe("ReportingTab concept/location/department filters", () => {
  beforeEach(() => {
    queryState.locationsLoaded = true;
    queryState.departmentsFetching = false;
  });

  it("lists every location in the picker when no concept is selected", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByTestId("reporting-location-filter-trigger"));
    expect(screen.getByTestId("reporting-location-filter-option-loc-1")).toBeInTheDocument();
    expect(screen.getByTestId("reporting-location-filter-option-loc-2")).toBeInTheDocument();
  });

  it("narrows the location picker's options to the selected concept's locations", () => {
    render(<ReportingTab />, { wrapper });
    selectConceptA();
    fireEvent.click(screen.getByTestId("reporting-location-filter-trigger"));
    expect(screen.getByTestId("reporting-location-filter-option-loc-1")).toBeInTheDocument();
    expect(screen.queryByTestId("reporting-location-filter-option-loc-2")).not.toBeInTheDocument();
  });

  it("excludes logs from locations outside the selected concept", () => {
    render(<ReportingTab />, { wrapper });
    selectConceptA();
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });

  it("excludes an unstarted checklist from a location outside the selected concept", () => {
    render(<ReportingTab />, { wrapper });
    selectConceptA();
    fireEvent.change(screen.getByTestId("reporting-status-filter"), { target: { value: "unstarted" } });
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });

  it("keeps an org-wide (unassigned) unstarted checklist visible even when a concept is selected", () => {
    render(<ReportingTab />, { wrapper });
    selectConceptA();
    fireEvent.change(screen.getByTestId("reporting-status-filter"), { target: { value: "unstarted" } });
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
  });

  it("narrows the department picker's options to the union of departments across scoped locations", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByTestId("reporting-department-filter-trigger"));
    expect(screen.getByTestId("reporting-department-filter-option-dept-kitchen")).toBeInTheDocument();
    expect(screen.getByTestId("reporting-department-filter-option-dept-bar")).toBeInTheDocument();
  });

  it("excludes logs whose checklist doesn't belong to the selected department", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByTestId("reporting-department-filter-trigger"));
    fireEvent.click(screen.getByTestId("reporting-department-filter-option-dept-kitchen"));
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });

  it("drops a picked location once a concept that excludes it is selected", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByTestId("reporting-location-filter-trigger"));
    fireEvent.click(screen.getByTestId("reporting-location-filter-option-loc-2"));
    expect(screen.getByTestId("reporting-location-filter-trigger")).toHaveTextContent("Terrace");
    selectConceptA();
    expect(screen.getByTestId("reporting-location-filter-trigger")).toHaveTextContent("All locations");
  });

  it("keeps a deep-linked initialLocationId while locations are still loading", () => {
    queryState.locationsLoaded = false;
    const { rerender } = render(<ReportingTab initialLocationId="loc-2" />, { wrapper });
    queryState.locationsLoaded = true;
    rerender(<ReportingTab initialLocationId="loc-2" />);
    expect(screen.getByTestId("reporting-location-filter-trigger")).toHaveTextContent("Terrace");
    expect(screen.getByText("Closing Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Opening Checklist")).not.toBeInTheDocument();
  });

  it("keeps a department pick while the department list refetches", () => {
    const { rerender } = render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByTestId("reporting-department-filter-trigger"));
    fireEvent.click(screen.getByTestId("reporting-department-filter-option-dept-kitchen"));
    queryState.departmentsFetching = true;
    rerender(<ReportingTab />);
    queryState.departmentsFetching = false;
    rerender(<ReportingTab />);
    expect(screen.getByTestId("reporting-department-filter-trigger")).toHaveTextContent("Kitchen");
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });
});
