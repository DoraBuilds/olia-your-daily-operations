import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TimingReportTab } from "@/pages/reporting/TimingReportTab";
import { renderWithProviders } from "../../test-utils";

const mockSetNote = vi.fn();
let mockData: any;

vi.mock("@/hooks/useTimingReport", () => ({
  useTimingReportData: () => ({ data: mockData, isLoading: false }),
  useSetMissedNote: () => ({ mutate: mockSetNote, isPending: false }),
}));
vi.mock("@/hooks/useConcepts", () => ({ useConcepts: () => ({ data: [] }) }));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => ({ data: [{ id: "a", name: "Cafe A", concept_id: null }] }) }));
vi.mock("@/hooks/useDepartments", () => ({ useCompanyDepartments: () => ({ data: [{ id: "kitchen", name: "Kitchen" }] }) }));
vi.mock("@/hooks/useChecklists", () => ({ useChecklists: () => ({ data: [{ id: "open", department_ids: ["kitchen"] }] }) }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("TimingReportTab", () => {
  beforeEach(() => {
    mockSetNote.mockReset();
    mockData = {
      logs: [
        { id: "1", checklist_id: "open", location_id: "a", timing_status: "on_time", created_at: "2026-10-15T08:00:00Z" },
        { id: "2", checklist_id: "open", location_id: "a", timing_status: "late", created_at: "2026-10-15T14:00:00Z" },
      ],
      misses: [
        { id: "m1", checklist_id: "open", checklist_title: "Opening checklist", location_id: "a", operating_date: "2026-10-15", route: "window_close", window_from: "08:00", window_until: "09:00", reason: "short_staffed", note: "Two of us", note_by: "Sam", note_at: "2026-10-15T10:00:00Z" },
        { id: "m2", checklist_id: "open", checklist_title: "Closing checklist", location_id: "a", operating_date: "2026-10-14", route: "after_overdue", window_from: null, window_until: null, reason: null, note: null, note_by: null, note_at: null,
          progress: { answered: 7, total: 10, items: [{ label: "Wipe down the grill", type: "checkbox", done: false, answer: "" }, { label: "Count the till", type: "number", done: true, answer: "120" }] } },
      ],
    };
  });

  it("shows on time, late and missed totals with percentages", () => {
    renderWithProviders(<TimingReportTab />);
    const totals = screen.getByTestId("timing-totals");
    expect(totals).toHaveTextContent("On time");
    expect(totals).toHaveTextContent("Late");
    expect(totals).toHaveTextContent("Missed");
    expect(totals).toHaveTextContent("50%");
  });

  it("breaks down by location and department", () => {
    renderWithProviders(<TimingReportTab />);
    expect(screen.getByTestId("timing-row-a")).toHaveTextContent("Cafe A");
    expect(screen.getByTestId("timing-row-a")).toHaveTextContent("1 on time · 1 late · 2 missed");
    expect(screen.getByTestId("timing-row-kitchen")).toHaveTextContent("Kitchen");
  });

  it("aggregates the missed reasons", () => {
    renderWithProviders(<TimingReportTab />);
    expect(screen.getByTestId("timing-reason-short_staffed")).toHaveTextContent("50%");
    expect(screen.getByTestId("timing-reason-none")).toHaveTextContent("No reason given");
  });

  it("shows the route of each miss and the existing note", () => {
    renderWithProviders(<TimingReportTab />);
    expect(screen.getByTestId("timing-miss-m1")).toHaveTextContent("Missed at window close");
    expect(screen.getByTestId("timing-miss-m1")).toHaveTextContent("Short-staffed: Two of us (Sam)");
    expect(screen.getByTestId("timing-miss-m2")).toHaveTextContent("Missed after Overdue");
  });

  it("lets a manager add a note to a miss from reporting", async () => {
    renderWithProviders(<TimingReportTab />);
    fireEvent.click(screen.getByTestId("timing-note-btn-m2"));
    expect(screen.getByTestId("timing-note-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("timing-reason-chip-forgot"));
    fireEvent.click(screen.getByTestId("timing-note-save"));
    await waitFor(() =>
      expect(mockSetNote).toHaveBeenCalledWith({ missId: "m2", reason: "forgot", note: "" }, expect.anything()),
    );
  });

  it("shows an empty state when nothing is stamped or missed", () => {
    mockData = { logs: [], misses: [] };
    renderWithProviders(<TimingReportTab />);
    expect(screen.getByText(/No timed checklists in this period yet/)).toBeInTheDocument();
  });

  it("shows how far a started-but-missed checklist got and which items were skipped", () => {
    renderWithProviders(<TimingReportTab />);
    const progress = screen.getByTestId("timing-progress-m2");
    expect(progress).toHaveTextContent("7/10 completed");
    expect(screen.queryByText("Wipe down the grill")).not.toBeInTheDocument();
    fireEvent.click(progress.querySelector("button")!);
    expect(screen.getByText("Wipe down the grill")).toBeInTheDocument();
    expect(screen.queryByText("Count the till")).not.toBeInTheDocument();
  });

  it("shows no progress for a miss that was never started", () => {
    renderWithProviders(<TimingReportTab />);
    expect(screen.queryByTestId("timing-progress-m1")).not.toBeInTheDocument();
  });
});
