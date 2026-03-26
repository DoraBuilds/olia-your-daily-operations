import { describe, expect, it } from "vitest";
import { computeMissedChecklists, computeOverdueActions } from "@/lib/overdue-utils";

const NOW_MINUTES = 14 * 60;
const TODAY_START_MS = new Date("2026-03-26T00:00:00").getTime();

describe("computeMissedChecklists", () => {
  it("includes a checklist with a past due_time that has no log today", () => {
    const result = computeMissedChecklists(
      [{ id: "c1", title: "Morning Check", due_time: "09:00" }],
      new Set(),
      NOW_MINUTES
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("excludes a checklist with a past due_time that already has a log today", () => {
    const result = computeMissedChecklists(
      [{ id: "c1", title: "Morning Check", due_time: "09:00" }],
      new Set(["c1"]),
      NOW_MINUTES
    );

    expect(result).toHaveLength(0);
  });

  it("excludes a checklist with a future due_time", () => {
    const result = computeMissedChecklists(
      [{ id: "c1", title: "Evening Close", due_time: "22:00" }],
      new Set(),
      NOW_MINUTES
    );

    expect(result).toHaveLength(0);
  });

  it("excludes a checklist with no due_time", () => {
    const result = computeMissedChecklists(
      [{ id: "c1", title: "Anytime Task", due_time: null }],
      new Set(),
      NOW_MINUTES
    );

    expect(result).toHaveLength(0);
  });

  it("uses a strict less-than check for the boundary", () => {
    const result = computeMissedChecklists(
      [{ id: "c1", title: "Exact Time", due_time: "14:00" }],
      new Set(),
      NOW_MINUTES
    );

    expect(result).toHaveLength(0);
  });

  it("returns only missed and uncompleted items from a mixed set", () => {
    const checklists = [
      { id: "c1", title: "Overdue not done", due_time: "08:00" },
      { id: "c2", title: "Overdue but done", due_time: "09:00" },
      { id: "c3", title: "Future", due_time: "20:00" },
      { id: "c4", title: "No schedule", due_time: null },
    ];

    const result = computeMissedChecklists(checklists, new Set(["c2"]), NOW_MINUTES);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("returns an empty array when given no checklists", () => {
    const result = computeMissedChecklists([], new Set(), NOW_MINUTES);
    expect(result).toHaveLength(0);
  });
});

describe("computeOverdueActions", () => {
  it("includes an unresolved action with a past due date", () => {
    const result = computeOverdueActions(
      [{ id: "a1", status: "open", due: "2026-03-25" }],
      TODAY_START_MS
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("excludes a resolved action even if its due date is in the past", () => {
    const result = computeOverdueActions(
      [{ id: "a1", status: "resolved", due: "2026-03-25" }],
      TODAY_START_MS
    );

    expect(result).toHaveLength(0);
  });

  it("excludes an action with no due date", () => {
    const result = computeOverdueActions(
      [{ id: "a1", status: "open", due: null }],
      TODAY_START_MS
    );

    expect(result).toHaveLength(0);
  });

  it("excludes an action due today", () => {
    const result = computeOverdueActions(
      [{ id: "a1", status: "open", due: "2026-03-26" }],
      TODAY_START_MS
    );

    expect(result).toHaveLength(0);
  });

  it("excludes an action due in the future", () => {
    const result = computeOverdueActions(
      [{ id: "a1", status: "open", due: "2026-03-28" }],
      TODAY_START_MS
    );

    expect(result).toHaveLength(0);
  });

  it("returns an empty array when given no actions", () => {
    const result = computeOverdueActions([], TODAY_START_MS);
    expect(result).toHaveLength(0);
  });
});
