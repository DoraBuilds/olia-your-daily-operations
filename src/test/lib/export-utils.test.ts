import { exportReportingCsv, exportReportingPdf, exportLogDetailPdf } from "@/lib/export-utils";
import type { ReportingRow, LogDetailData } from "@/lib/export-utils";

// Create a factory for fresh mock doc instances
function makeMockDoc() {
  return {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    setDrawColor: vi.fn(),
    line: vi.fn(),
    save: vi.fn(),
    internal: {
      pageSize: {
        getWidth: vi.fn().mockReturnValue(210),
      },
    },
    lastAutoTable: { finalY: 100 },
  };
}

// Module-level reference to the current mock doc — the vi.mock closure always reads this
// eslint-disable-next-line prefer-const
let _doc = makeMockDoc();
const mockAutoTable = vi.fn();

vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(() => _doc),
}));

vi.mock("jspdf-autotable", () => ({
  default: (...args: any[]) => mockAutoTable(...args),
}));

// URL mock refs
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:test-url");
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();

Object.defineProperty(window, "URL", {
  writable: true,
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
});

// Spy on createElement globally
const _origCreate = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  if (tag === "a") {
    const el = _origCreate("a") as HTMLAnchorElement;
    el.click = mockClick;
    return el;
  }
  return _origCreate(tag);
});

beforeEach(() => {
  // Reset the mock doc by recreating its internal vi.fn() calls
  _doc.setFont.mockClear();
  _doc.setFontSize.mockClear();
  _doc.setTextColor.mockClear();
  _doc.text.mockClear();
  _doc.setDrawColor.mockClear();
  _doc.line.mockClear();
  _doc.save.mockClear();
  _doc.internal.pageSize.getWidth.mockClear().mockReturnValue(210);

  mockCreateObjectURL.mockClear().mockReturnValue("blob:test-url");
  mockRevokeObjectURL.mockClear();
  mockClick.mockClear();
  mockAutoTable.mockClear();
});

const sampleRows: ReportingRow[] = [
  {
    checklist: "Opening Checklist",
    location: "Main Branch",
    completedBy: "Sarah",
    startedAt: "09 Mar 2026, 08:00",
    finishedAt: "09 Mar 2026, 08:25",
    score: 92,
  },
  {
    checklist: "Closing Checklist",
    location: "City Centre",
    completedBy: "James",
    startedAt: "09 Mar 2026, 22:00",
    finishedAt: "09 Mar 2026, 22:18",
    score: 72,
  },
  {
    checklist: "Food Safety Log",
    location: "Harbour",
    completedBy: "Maria",
    startedAt: "09 Mar 2026, 12:10",
    finishedAt: "09 Mar 2026, 12:14",
    score: 50,
  },
];

const sampleStats = { completed: 3, avg: 71, open: 2 };

describe("exportReportingCsv", () => {
  it("calls URL.createObjectURL to create a blob URL", () => {
    exportReportingCsv(sampleRows, "Today");
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
  });

  it("calls URL.revokeObjectURL after triggering download", () => {
    exportReportingCsv(sampleRows, "Today");
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("clicks the anchor to trigger download", () => {
    exportReportingCsv(sampleRows, "Today");
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it("sets download attribute with correct filename based on periodLabel", () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    const captureOrigCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const el = captureOrigCreate("a") as HTMLAnchorElement;
        el.click = mockClick;
        capturedAnchor = el;
        return el;
      }
      return captureOrigCreate(tag);
    });

    exportReportingCsv(sampleRows, "March 2026");
    expect(capturedAnchor?.download).toContain("completion-logs");
  });
});

describe("exportReportingPdf", () => {
  it("calls doc.save with a filename containing 'completion-logs'", async () => {
    await exportReportingPdf(sampleRows, "Today", sampleStats);
    expect(_doc.save).toHaveBeenCalledTimes(1);
    const savedName = _doc.save.mock.calls[0][0] as string;
    expect(savedName).toContain("completion-logs");
  });

  it("includes checklist, location, person, start, end, and pass percentage columns", async () => {
    await exportReportingPdf(sampleRows, "Today", sampleStats);
    expect(mockAutoTable).toHaveBeenCalledTimes(1);
    const options = mockAutoTable.mock.calls[0][1];
    expect(options.head[0]).toEqual([
      "Checklist",
      "Location",
      "Completed by",
      "Start date/time",
      "End date/time",
      "Pass %",
    ]);
    expect(options.body[0]).toEqual([
      "Opening Checklist",
      "Main Branch",
      "Sarah",
      "09 Mar 2026, 08:00",
      "09 Mar 2026, 08:25",
      "92%",
    ]);
  });

  it("calls doc.save with period label in filename", async () => {
    await exportReportingPdf(sampleRows, "March-2026", sampleStats);
    const savedName = _doc.save.mock.calls[0][0] as string;
    expect(savedName).toContain("March-2026");
  });

  it("calls doc.text at least once (header text)", async () => {
    await exportReportingPdf(sampleRows, "Today", sampleStats);
    expect(_doc.text).toHaveBeenCalled();
  });

  it("calls setFont for styling", async () => {
    await exportReportingPdf(sampleRows, "Today", sampleStats);
    expect(_doc.setFont).toHaveBeenCalled();
  });
});

describe("exportLogDetailPdf", () => {
  const sampleLog: LogDetailData = {
    checklist: "Opening Checklist",
    completedBy: "Sarah",
    date: "09 Mar 2026",
    score: 95,
    answers: [
      { label: "Fridge temp", type: "checkbox", required: true, answer: "yes" },
      { label: "Cash float", type: "numeric", required: false, answer: "100" },
      { label: "Photo of setup", type: "photo", required: false, hasPhoto: true },
    ],
  };

  it("calls doc.save with sanitized checklist name", async () => {
    await exportLogDetailPdf(sampleLog);
    expect(_doc.save).toHaveBeenCalledTimes(1);
    const savedName = _doc.save.mock.calls[0][0] as string;
    expect(savedName).toContain("Opening-Checklist");
    expect(savedName).toContain("-report.pdf");
  });

  it("handles special characters in checklist name", async () => {
    await exportLogDetailPdf({
      ...sampleLog,
      checklist: "Food & Safety Log!",
    });
    const savedName = _doc.save.mock.calls[0][0] as string;
    // Special chars stripped
    expect(savedName).toContain("Food");
    expect(savedName).toContain("Safety");
    expect(savedName).not.toContain("&");
    expect(savedName).not.toContain("!");
  });

  it("calls doc.text at least once (header)", async () => {
    await exportLogDetailPdf(sampleLog);
    expect(_doc.text).toHaveBeenCalled();
  });
});

describe("scoreRgb logic (via exportReportingPdf)", () => {
  it("uses setTextColor at least once for score=90 (OK color)", async () => {
    await exportReportingPdf(
      [{ checklist: "Test", completedBy: "A", date: "today", score: 90 }],
      "Today",
      { completed: 1, avg: 90, open: 0 }
    );
    expect(_doc.setTextColor).toHaveBeenCalled();
  });

  it("uses setTextColor at least once for score=70 (WARN color)", async () => {
    await exportReportingPdf(
      [{ checklist: "Test", completedBy: "A", date: "today", score: 70 }],
      "Today",
      { completed: 1, avg: 70, open: 0 }
    );
    expect(_doc.setTextColor).toHaveBeenCalled();
  });

  it("uses setTextColor at least once for score=50 (ERR color)", async () => {
    await exportReportingPdf(
      [{ checklist: "Test", completedBy: "A", date: "today", score: 50 }],
      "Today",
      { completed: 1, avg: 50, open: 0 }
    );
    expect(_doc.setTextColor).toHaveBeenCalled();
  });
});
