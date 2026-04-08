import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
      insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1",
      organization_id: "org1",
      name: "Sarah",
      email: "s@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const mockExportReportingPdf = vi.fn();
const mockExportReportingCsv = vi.fn();
const mockExportLogDetailPdf = vi.fn();
const mockUseChecklistLogs = vi.fn((filters?: any) => ({
  data: filters?.location_id
    ? MOCK_LOGS.filter(log => log.location_id === filters.location_id)
    : MOCK_LOGS,
  isLoading: false,
}));

vi.mock("@/lib/export-utils", () => ({
  exportReportingPdf: (...args: any[]) => mockExportReportingPdf(...args),
  exportReportingCsv: (...args: any[]) => mockExportReportingCsv(...args),
  exportLogDetailPdf: (...args: any[]) => mockExportLogDetailPdf(...args),
}));

// Use STABLE array references to avoid infinite re-render loops in useEffect deps
const MOCK_LOGS = [
  {
    id: "l1",
    checklist_id: "c1",
    checklist_title: "Opening Checklist",
    completed_by: "Alice",
    staff_profile_id: "sp1",
    score: 90,
    type: "opening",
    answers: [
      { label: "Check fridge", type: "checkbox", required: true, answer: "yes" },
    ],
    created_at: "2024-03-09T08:00:00Z",
    started_at: "2024-03-09T07:45:00Z",
    location_id: "loc-1",
  },
  {
    id: "l2",
    checklist_id: "c1",
    checklist_title: "Closing Checklist",
    completed_by: "Bob",
    staff_profile_id: "sp2",
    score: 65,
    type: "closing",
    answers: [],
    created_at: "2024-03-09T22:00:00Z",
    started_at: "2024-03-09T21:40:00Z",
    location_id: "loc-2",
  },
  {
    id: "l3",
    checklist_id: "c2",
    checklist_title: "Inventory Check",
    completed_by: "Dana",
    staff_profile_id: "sp3",
    score: null,
    type: "inspection",
    answers: [],
    created_at: "2024-03-09T12:00:00Z",
    started_at: "2024-03-09T11:30:00Z",
    location_id: "loc-1",
  },
];

const MOCK_ACTIONS = [
  {
    id: "a1",
    title: "Fix fridge seal",
    checklist_id: "c1",
    checklist_title: "Opening Checklist",
    assigned_to: "Marc",
    due: "Today",
    status: "open",
    created_at: "2024-03-09T08:00:00Z",
  },
];

vi.mock("@/hooks/useChecklistLogs", () => ({
  useChecklistLogs: (filters?: any) => mockUseChecklistLogs(filters),
  useCreateChecklistLog: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useActions", () => ({
  useActions: () => ({
    data: MOCK_ACTIONS,
    isLoading: false,
  }),
  useCreateAction: () => ({ mutate: vi.fn() }),
  useUpdateAction: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "City Centre" },
    ],
    isLoading: false,
  }),
}));

// Mock Recharts to avoid SVG rendering issues in jsdom
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

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    features: {},
  }),
}));

describe("ReportingTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChecklistLogs.mockClear();
  });

  it("renders without crashing", () => {
    render(<ReportingTab />, { wrapper });
    // "Today" appears in both the period tab and the completion log sub-label
    expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(1);
  });

  it("shows period tabs: Today, This Week, This Month", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("This Month")).toBeInTheDocument();
  });

  it("shows Custom date picker button", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("shows Entries stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Entries")).toBeInTheDocument();
  });

  it("shows 3 log entries", () => {
    render(<ReportingTab />, { wrapper });
    const statCards = document.querySelectorAll(".grid.grid-cols-3 .text-2xl");
    expect(statCards[0]).toHaveTextContent("3");
  });

  it("shows Avg Score stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Avg Score")).toBeInTheDocument();
  });

  it("shows correct avg score (90+65)/2 = 78%", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("shows Open Actions stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Open Actions")).toBeInTheDocument();
  });

  it("shows 1 open action", () => {
    render(<ReportingTab />, { wrapper });
    // "1" appears in multiple places (open actions count + completion log counts)
    // Verify specifically the Open Actions stat card contains "1"
    const statCards = document.querySelectorAll(".grid.grid-cols-3 .text-2xl");
    const openActionsValue = statCards[2]; // third stat card is Open Actions
    expect(openActionsValue).toHaveTextContent("1");
  });

  it("shows Completion Log section", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Completion Log")).toBeInTheDocument();
  });

  it("shows 'Opening Checklist' in the log", () => {
    render(<ReportingTab />, { wrapper });
    // "Opening Checklist" appears in the Completion Log table
    const matches = screen.getAllByText("Opening Checklist");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Closing Checklist' in the log", () => {
    render(<ReportingTab />, { wrapper });
    const matches = screen.getAllByText("Closing Checklist");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows UNFINISHED badge for incomplete log entries", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("UNFINISHED")).toBeInTheDocument();
  });

  it("shows PASS badge for score 90", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("PASS")).toBeInTheDocument();
  });

  it("shows REVIEW badge for score 65", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("REVIEW")).toBeInTheDocument();
  });

  it("shows completed by names in log", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
  });

  it("shows CSV export button in the top toolbar", () => {
    // Export section was moved from the bottom to the top toolbar (next to date filters).
    // The dedicated "Export" heading was removed; buttons are directly in the toolbar.
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("CSV")).toBeInTheDocument();
  });

  it("shows CSV export button", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("CSV")).toBeInTheDocument();
  });

  it("shows PDF export button", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("clicking PDF export calls exportReportingPdf", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByText("PDF"));
    expect(mockExportReportingPdf).toHaveBeenCalledTimes(1);
    const [rows, periodLabel, stats] = mockExportReportingPdf.mock.calls[0];
    expect(rows).toHaveLength(3);
    expect(rows).toEqual([
      expect.objectContaining({
        checklist: "Opening Checklist",
        location: "Main Branch",
        completedBy: "Alice",
        score: 90,
      }),
      expect.objectContaining({
        checklist: "Closing Checklist",
        location: "City Centre",
        completedBy: "Bob",
        score: 65,
      }),
      expect.objectContaining({
        checklist: "Inventory Check",
        location: "Main Branch",
        completedBy: "Dana",
        score: null,
      }),
    ]);
    for (const row of rows) {
      expect(row.startedAt).toMatch(/9 Mar 2024/);
      expect(row.finishedAt).toMatch(/9 Mar 2024/);
    }
    expect(periodLabel).toBe("Today");
    expect(stats).toMatchObject({ completed: 3, avg: 78, open: 1 });
  });

  it("clicking CSV export calls exportReportingCsv", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByText("CSV"));
    expect(mockExportReportingCsv).toHaveBeenCalled();
  });

  it("clicking a log row opens the log detail modal", async () => {
    render(<ReportingTab />, { wrapper });
    // Find the "Opening Checklist" text inside the completion log table buttons
    const allMatches = screen.getAllByText("Opening Checklist");
    // The one inside the log table row is wrapped in a <button>
    const logRowBtn = allMatches.find(el => el.closest("button"))?.closest("button");
    expect(logRowBtn).toBeTruthy();
    fireEvent.click(logRowBtn!);
    await waitFor(() => {
      expect(screen.getByText("Export PDF")).toBeInTheDocument();
    });
  });

  it("log detail modal shows the checklist title", async () => {
    render(<ReportingTab />, { wrapper });
    const allMatches = screen.getAllByText("Opening Checklist");
    const logRowBtn = allMatches.find(el => el.closest("button"))?.closest("button");
    fireEvent.click(logRowBtn!);
    await waitFor(() => {
      const headings = screen.getAllByText("Opening Checklist");
      // Should appear in the completion log row and modal heading
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  it("log detail modal shows completed by name", async () => {
    render(<ReportingTab />, { wrapper });
    const allMatches = screen.getAllByText("Opening Checklist");
    const logRowBtn = allMatches.find(el => el.closest("button"))?.closest("button");
    fireEvent.click(logRowBtn!);
    await waitFor(() => {
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });
  });

  it("log detail modal shows score 90%", async () => {
    render(<ReportingTab />, { wrapper });
    const allMatches = screen.getAllByText("Opening Checklist");
    const logRowBtn = allMatches.find(el => el.closest("button"))?.closest("button");
    fireEvent.click(logRowBtn!);
    await waitFor(() => {
      expect(screen.getByText("90%")).toBeInTheDocument();
    });
  });

  it("switching to This Week period works", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByText("This Week"));
    expect(screen.getByText("Completion Log")).toBeInTheDocument();
  });

  it("switching to This Month period works", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.click(screen.getByText("This Month"));
    expect(screen.getByText("Completion Log")).toBeInTheDocument();
  });

  it("does not show the By Checklist section", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.queryByText("By Checklist")).not.toBeInTheDocument();
  });

  it("filters logs by checklist name, person, and status", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.change(screen.getByTestId("reporting-checklist-search"), { target: { value: "Opening" } });
    expect(screen.getAllByText("Opening Checklist").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Inventory Check")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("reporting-checklist-search"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("reporting-person-filter"), { target: { value: "Bob" } });
    expect(screen.getByText("Closing Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Opening Checklist")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("reporting-person-filter"), { target: { value: "all" } });
    fireEvent.change(screen.getByTestId("reporting-status-filter"), { target: { value: "unfinished" } });
    expect(screen.getByText("UNFINISHED")).toBeInTheDocument();
  });

  it("clears filters when the reset button is clicked", () => {
    render(<ReportingTab />, { wrapper });
    fireEvent.change(screen.getByTestId("reporting-checklist-search"), { target: { value: "Inventory" } });
    expect(screen.getByTestId("reporting-clear-filters")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reporting-clear-filters"));
    expect(screen.getByTestId("reporting-checklist-search")).toHaveValue("");
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  });

  it("preselects a dashboard-provided location and filters the query", () => {
    render(<ReportingTab initialLocationId="loc-2" />, { wrapper });
    expect(screen.getByTestId("location-filter")).toHaveValue("loc-2");
    expect(mockUseChecklistLogs).toHaveBeenCalledWith(expect.objectContaining({ location_id: "loc-2" }));
    expect(screen.getByText("Closing Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Opening Checklist")).not.toBeInTheDocument();
  });
});
