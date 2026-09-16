/**
 * Concept-scoping coverage for ReportingTab — verifies the sidebar's concept
 * dropdown (ConceptFilterContext.scopedLocationIds) narrows:
 *  - the in-page location filter dropdown's options
 *  - completion-log entries, when "All locations" is selected within a narrowed concept
 *  - unstarted checklists, while an org-wide (unassigned) checklist stays visible
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ReportingTab } from "@/pages/checklists/ReportingTab";
import { routerFutureFlags } from "@/lib/router-future-flags";

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

// The mock only honours a single server-side location_id filter — the
// component's own client-side scoping (under test here) is what should
// additionally narrow results when locationFilter is "all" but a concept is selected.
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

const mockUseChecklistLogs = vi.fn((filters?: any) => ({
  data: filters?.location_id
    ? MOCK_LOGS.filter(log => log.location_id === filters.location_id)
    : MOCK_LOGS,
  isLoading: false,
}));

vi.mock("@/hooks/useChecklistLogs", () => ({
  useChecklistLogs: (filters?: any) => mockUseChecklistLogs(filters),
  useCreateChecklistLog: () => ({ mutate: vi.fn() }),
}));

// c1 (loc-1) has a log → completed, not unstarted.
// c2 (loc-2) has no log → unstarted, should disappear once scoped to loc-1.
// c3 (no location) has no log → unstarted, should stay visible even when scoped.
const MOCK_CHECKLISTS = [
  { id: "c1", title: "Opening Checklist", location_id: "loc-1", location_ids: null, start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "morning", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "c2", title: "Closing Checklist", location_id: "loc-2", location_ids: null, start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "evening", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "c3", title: "Org Wide Checklist", location_id: null, location_ids: null, start_date: null, schedule: "daily", folder_id: null, organization_id: "org1", sections: [], time_of_day: "anytime", due_time: null, visibility_from: null, visibility_until: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
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

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "Terrace" },
    ],
    isLoading: false,
  }),
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

describe("ReportingTab concept scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptFilterState.scopedLocationIds = null;
    mockUseChecklistLogs.mockImplementation((filters?: any) => ({
      data: filters?.location_id
        ? MOCK_LOGS.filter(log => log.location_id === filters.location_id)
        : MOCK_LOGS,
      isLoading: false,
    }));
  });

  it("lists every location in the filter dropdown when no concept is selected", () => {
    render(<ReportingTab />, { wrapper });
    const select = screen.getByTestId("location-filter");
    expect(within(select).getByRole("option", { name: "Main Branch" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Terrace" })).toBeInTheDocument();
  });

  it("narrows the location filter dropdown to the selected concept's locations", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ReportingTab />, { wrapper });
    const select = screen.getByTestId("location-filter");
    expect(within(select).getByRole("option", { name: "Main Branch" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Terrace" })).not.toBeInTheDocument();
  });

  it("excludes logs from locations outside the selected concept when the in-page filter is 'All'", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });

  it("excludes an unstarted checklist from a location outside the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ReportingTab />, { wrapper });
    fireEvent.change(screen.getByTestId("reporting-status-filter"), { target: { value: "unstarted" } });
    expect(screen.queryByText("Closing Checklist")).not.toBeInTheDocument();
  });

  it("keeps an org-wide (unassigned) unstarted checklist visible even when a concept is selected", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ReportingTab />, { wrapper });
    fireEvent.change(screen.getByTestId("reporting-status-filter"), { target: { value: "unstarted" } });
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
  });
});
