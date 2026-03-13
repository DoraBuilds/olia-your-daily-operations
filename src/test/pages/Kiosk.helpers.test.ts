import { describe, it, expect } from "vitest";
import { isVisibleAtTime } from "@/pages/Kiosk";

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
