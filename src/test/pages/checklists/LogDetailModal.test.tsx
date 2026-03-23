import { render, screen, fireEvent } from "@testing-library/react";
import { LogDetailModal } from "@/pages/checklists/LogDetailModal";
import type { LogEntry } from "@/pages/checklists/types";

const mockExportLogDetailPdf = vi.fn();

vi.mock("@/lib/export-utils", () => ({
  exportReportingPdf: vi.fn(),
  exportReportingCsv: vi.fn(),
  exportLogDetailPdf: (...args: any[]) => mockExportLogDetailPdf(...args),
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
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

const mockLog: LogEntry = {
  id: "l1",
  checklist: "Opening Checklist",
  completedBy: "Alice Smith",
  date: "Today, 08:00",
  score: 90,
  type: "opening",
  answers: [
    { label: "Check fridge temperature", type: "numeric", required: true, answer: "4", comment: "All good" },
    { label: "Sanitize surfaces", type: "checkbox", required: true, answer: "yes" },
    { label: "Photo of workspace", type: "photo", required: false, hasPhoto: true },
    { label: "Stock check", type: "checkbox", required: false, answer: "no" },
  ],
};

const lowScoreLog: LogEntry = {
  id: "l2",
  checklist: "Closing Checklist",
  completedBy: "Bob Jones",
  date: "Yesterday, 22:00",
  score: 60,
  type: "closing",
  answers: [],
};

describe("LogDetailModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  });

  it("shows checklist title", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  });

  it("shows completed by and date", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText(/Today, 08:00/)).toBeInTheDocument();
  });

  it("shows score", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows green color for high score (>=85)", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    const scoreEl = screen.getByText("90%");
    expect(scoreEl.className).toContain("status-ok");
  });

  it("shows red color for low score (<65)", () => {
    render(<LogDetailModal log={lowScoreLog} onClose={onClose} />);
    const scoreEl = screen.getByText("60%");
    expect(scoreEl.className).toContain("status-error");
  });

  it("has Export PDF button", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Export PDF")).toBeInTheDocument();
  });

  it("clicking Export PDF calls exportLogDetailPdf", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    fireEvent.click(screen.getByText("Export PDF"));
    expect(mockExportLogDetailPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        checklist: "Opening Checklist",
        completedBy: "Alice Smith",
        score: 90,
      })
    );
  });

  it("close button calls onClose", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    // Last button is the X close button
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows question labels from answers", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Check fridge temperature")).toBeInTheDocument();
    expect(screen.getByText("Sanitize surfaces")).toBeInTheDocument();
  });

  it("shows comment text when present", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows 'Completed' for checked answers", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows 'Not completed' for unchecked answers", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText("Not completed")).toBeInTheDocument();
  });

  it("shows numeric answer value", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    // The modal renders the raw numeric value (no unit suffix — units are question-specific)
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows read-only footer note", () => {
    render(<LogDetailModal log={mockLog} onClose={onClose} />);
    expect(screen.getByText(/read-only report/i)).toBeInTheDocument();
  });

  it("renders with empty answers array", () => {
    render(<LogDetailModal log={lowScoreLog} onClose={onClose} />);
    expect(screen.getByText("Closing Checklist")).toBeInTheDocument();
  });
});
