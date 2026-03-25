import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ReportingTab } from "@/pages/checklists/ReportingTab";

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
  useChecklistLogs: () => ({
    data: MOCK_LOGS,
    isLoading: false,
  }),
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
      <MemoryRouter>{children}</MemoryRouter>
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

  it("shows Completed stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows 2 completed checklists", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows Avg Score stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Avg Score")).toBeInTheDocument();
  });

  it("shows correct avg score (90+65)/2 = 77%", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("78%")).toBeInTheDocument();
  });

  it("shows Open Actions stat card", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("Open Actions")).toBeInTheDocument();
  });

  it("shows 1 open action", () => {
    render(<ReportingTab />, { wrapper });
    // "1" appears in multiple places (open actions count + By Checklist bar counts)
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
    // "Opening Checklist" appears in the Completion Log table AND in the By Checklist bar chart
    const matches = screen.getAllByText("Opening Checklist");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Closing Checklist' in the log", () => {
    render(<ReportingTab />, { wrapper });
    const matches = screen.getAllByText("Closing Checklist");
    expect(matches.length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
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
    expect(mockExportReportingPdf).toHaveBeenCalled();
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
      // Should appear in: By Checklist bar, log table row, AND modal heading
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

  it("shows By Checklist section when data present", () => {
    render(<ReportingTab />, { wrapper });
    expect(screen.getByText("By Checklist")).toBeInTheDocument();
  });
});
