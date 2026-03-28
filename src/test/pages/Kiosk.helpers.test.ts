import { describe, it, expect } from "vitest";
import { getKioskVisibilityState, isVisibleAtTime } from "@/pages/Kiosk";

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
