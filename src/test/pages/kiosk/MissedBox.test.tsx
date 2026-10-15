import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MissedBox } from "@/pages/kiosk/MissedBox";
import { getKioskOperatingDate } from "@/pages/kiosk/utils";
import type { KioskChecklist } from "@/pages/kiosk/types";
import { renderWithProviders } from "../../test-utils";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const checklist: KioskChecklist = {
  id: "c1",
  title: "Opening checklist",
  location_id: "loc1",
  time_of_day: "anytime",
  due_time: null,
  visibility_from: "08:00",
  visibility_until: "09:00",
  allow_late_completion: false,
  day_end_time: "00:00",
  questions: [],
};

const now = new Date(2026, 9, 15, 14, 0, 0);

function renderBox(list: KioskChecklist[] = [checklist]) {
  return renderWithProviders(
    <MissedBox
      checklists={list}
      locationId="loc1"
      dayEndTime="00:00"
      departmentIds={["d1"]}
      staffName="Dora Angelov"
      now={now}
    />,
  );
}

describe("getKioskOperatingDate", () => {
  it("is the calendar date with a midnight day end", () => {
    expect(getKioskOperatingDate(new Date(2026, 9, 15, 0, 5), "00:00")).toBe("2026-10-15");
    expect(getKioskOperatingDate(new Date(2026, 9, 15, 23, 59), null)).toBe("2026-10-15");
  });

  it("keeps early-morning hours in the previous day before the day end", () => {
    expect(getKioskOperatingDate(new Date(2026, 9, 15, 1, 30), "04:00")).toBe("2026-10-14");
    expect(getKioskOperatingDate(new Date(2026, 9, 15, 4, 0), "04:00")).toBe("2026-10-15");
  });
});

describe("MissedBox", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "get_kiosk_missed_notes" ? [] : null, error: null }),
    );
  });

  it("renders nothing when nothing was missed", () => {
    const { container } = renderBox([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists missed checklists without any way to complete them", () => {
    renderBox();
    expect(screen.getByTestId("kiosk-missed-box")).toBeInTheDocument();
    expect(screen.getByText("Opening checklist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start|open|complete/i })).not.toBeInTheDocument();
  });

  it("shows an existing note with its reason and author", async () => {
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve({
        data: fn === "get_kiosk_missed_notes"
          ? [{ checklist_id: "c1", reason: "short_staffed", note: "Only two of us", note_by: "Sam" }]
          : null,
        error: null,
      }),
    );
    renderBox();
    expect(await screen.findByText(/Only two of us/)).toBeInTheDocument();
    expect(screen.getByText("Short-staffed")).toBeInTheDocument();
    expect(screen.getByText(/\(Sam\)/)).toBeInTheDocument();
  });

  it("saves a note with a reason, who wrote it and the operating date", async () => {
    renderBox();
    fireEvent.click(screen.getByTestId("missed-note-btn-c1"));
    expect(screen.getByTestId("missed-note-save")).toBeDisabled();

    fireEvent.click(screen.getByTestId("missed-reason-forgot"));
    fireEvent.change(screen.getByPlaceholderText("Optional details"), { target: { value: "Got busy" } });
    fireEvent.click(screen.getByTestId("missed-note-save"));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith("add_kiosk_missed_note", {
        p_location_id: "loc1",
        p_checklist_id: "c1",
        p_operating_date: "2026-10-15",
        p_reason: "forgot",
        p_note: "Got busy",
        p_by: "Dora Angelov",
        p_department_ids: ["d1"],
      }),
    );
  });
});
