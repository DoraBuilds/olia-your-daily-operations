import { describe, it, expect } from "vitest";
import { getKioskVisibilityState, isVisibleAtTime } from "@/pages/Kiosk";
import { getKioskTimingStatus } from "@/pages/kiosk/utils";

function makeDate(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe("isVisibleAtTime", () => {
  it("'anytime' is always visible", () => {
    expect(isVisibleAtTime("anytime", makeDate(3))).toBe(true);
    expect(isVisibleAtTime("anytime", makeDate(14))).toBe(true);
    expect(isVisibleAtTime("anytime", makeDate(23))).toBe(true);
  });

  it("'morning' visible 05:00–11:59", () => {
    expect(isVisibleAtTime("morning", makeDate(5))).toBe(true);
    expect(isVisibleAtTime("morning", makeDate(11))).toBe(true);
    expect(isVisibleAtTime("morning", makeDate(4))).toBe(false);
    expect(isVisibleAtTime("morning", makeDate(12))).toBe(false);
  });

  it("'afternoon' visible 12:00–16:59", () => {
    expect(isVisibleAtTime("afternoon", makeDate(12))).toBe(true);
    expect(isVisibleAtTime("afternoon", makeDate(16))).toBe(true);
    expect(isVisibleAtTime("afternoon", makeDate(11))).toBe(false);
    expect(isVisibleAtTime("afternoon", makeDate(17))).toBe(false);
  });

  it("'evening' visible 17:00–21:59", () => {
    expect(isVisibleAtTime("evening", makeDate(17))).toBe(true);
    expect(isVisibleAtTime("evening", makeDate(21))).toBe(true);
    expect(isVisibleAtTime("evening", makeDate(16))).toBe(false);
    expect(isVisibleAtTime("evening", makeDate(22))).toBe(false);
  });
});

describe("getKioskVisibilityState", () => {
  const makeDate = (hour: number, minute = 0): Date => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  it("uses an explicit visibility window when provided", () => {
    const checklist = { due_time: null, visibility_from: "09:00", visibility_until: "10:00" };

    expect(getKioskVisibilityState(checklist, makeDate(8, 30))).toBe("upcoming");
    expect(getKioskVisibilityState(checklist, makeDate(9, 30))).toBe("due");
    expect(getKioskVisibilityState(checklist, makeDate(10, 30))).toBe("overdue");
  });

  it("keeps legacy due_time behavior when no visibility window exists", () => {
    const checklist = { due_time: "14:00", visibility_from: null, visibility_until: null };

    expect(getKioskVisibilityState(checklist, makeDate(13, 30))).toBe("due");
    expect(getKioskVisibilityState(checklist, makeDate(14, 30))).toBe("overdue");
  });

  it("shows all-day visibility when neither a window nor due_time is set", () => {
    const checklist = { due_time: null, visibility_from: null, visibility_until: null };

    expect(getKioskVisibilityState(checklist, makeDate(3, 15))).toBe("due");
    expect(getKioskVisibilityState(checklist, makeDate(15, 15))).toBe("due");
  });
});

describe("getKioskVisibilityState: late completion and day end", () => {
  const makeDate = (hour: number, minute = 0): Date => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const window = { due_time: null, visibility_from: "08:00", visibility_until: "09:00" };

  it("goes straight to missed after the window when late completion is off", () => {
    const checklist = { ...window, allow_late_completion: false };

    expect(getKioskVisibilityState(checklist, makeDate(8, 30))).toBe("due");
    expect(getKioskVisibilityState(checklist, makeDate(9, 30))).toBe("missed");
  });

  it("is overdue after the window when late completion is on (or unset)", () => {
    expect(getKioskVisibilityState({ ...window, allow_late_completion: true }, makeDate(14, 0))).toBe("overdue");
    expect(getKioskVisibilityState(window, makeDate(14, 0))).toBe("overdue");
  });

  it("stops being overdue at the end of the location's day, not midnight", () => {
    const checklist = { ...window, allow_late_completion: true, day_end_time: "04:00" };

    // 01:00 still belongs to the day that began yesterday: yesterday's morning window is overdue.
    expect(getKioskVisibilityState(checklist, makeDate(1, 0))).toBe("overdue");
    // After 04:00 the new day starts and the window is upcoming again.
    expect(getKioskVisibilityState(checklist, makeDate(4, 30))).toBe("upcoming");
    expect(getKioskVisibilityState(checklist, makeDate(23, 30))).toBe("overdue");
  });

  it("treats the default 00:00 day end as midnight", () => {
    const checklist = { ...window, allow_late_completion: true, day_end_time: "00:00" };

    expect(getKioskVisibilityState(checklist, makeDate(23, 59))).toBe("overdue");
    expect(getKioskVisibilityState(checklist, makeDate(0, 5))).toBe("upcoming");
  });
});

describe("getKioskTimingStatus", () => {
  const at = (hour: number, minute = 0): Date => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const window = { due_time: null, visibility_from: "08:00", visibility_until: "09:00" };

  it("stamps on time inside the window and late after it", () => {
    expect(getKioskTimingStatus(window, at(8, 15))).toBe("on_time");
    expect(getKioskTimingStatus(window, at(14, 0))).toBe("late");
  });

  it("does not stamp when there is no due window", () => {
    expect(getKioskTimingStatus({ due_time: null, visibility_from: null, visibility_until: null }, at(14, 0))).toBeNull();
  });

  it("does not stamp outside the completable states", () => {
    expect(getKioskTimingStatus(window, at(7, 0))).toBeNull();
    expect(getKioskTimingStatus({ ...window, allow_late_completion: false }, at(14, 0))).toBeNull();
  });
});
