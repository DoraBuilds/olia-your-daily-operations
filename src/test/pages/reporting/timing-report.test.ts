import { describe, it, expect } from "vitest";
import { buildTimingReport, pctOf, type TimingLog, type TimingMiss } from "@/pages/reporting/timing-report";

const locations = [{ id: "a", name: "Cafe A" }, { id: "b", name: "Cafe B" }];
const checklists = [
  { id: "open", department_ids: ["kitchen"] },
  { id: "close", department_ids: ["kitchen", "bar"] },
  { id: "all", department_ids: null },
];
const log = (id: string, checklist: string, loc: string, status: TimingLog["timing_status"]): TimingLog => ({
  id, checklist_id: checklist, location_id: loc, timing_status: status, created_at: "2026-10-15T08:00:00Z",
});
const miss = (id: string, checklist: string, loc: string, reason: TimingMiss["reason"] = null, date = "2026-10-15"): TimingMiss => ({
  id, checklist_id: checklist, checklist_title: checklist, location_id: loc, operating_date: date,
  route: "window_close", window_from: null, window_until: null, reason, note: null, note_by: null, note_at: null,
});
const noScope = { locationIds: null, departmentIds: null };

describe("buildTimingReport", () => {
  const logs = [log("1", "open", "a", "on_time"), log("2", "open", "a", "late"), log("3", "all", "b", "on_time"), log("4", "open", "a", null)];
  const misses = [miss("m1", "open", "a", "short_staffed"), miss("m2", "all", "b"), miss("m3", "close", "b", "short_staffed", "2026-10-14")];

  it("counts on time, late and missed, ignoring unstamped completions", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: noScope });
    expect(r.totals).toEqual({ onTime: 2, late: 1, missed: 3 });
  });

  it("breaks down by location", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: noScope });
    expect(r.byLocation.find(l => l.locationId === "a")?.counts).toEqual({ onTime: 1, late: 1, missed: 1 });
    expect(r.byLocation.find(l => l.locationId === "b")?.counts).toEqual({ onTime: 1, late: 0, missed: 2 });
  });

  it("breaks down by department, counting a shared checklist in each and no-department ones as all", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: noScope });
    const dept = (id: string | null) => r.byDepartment.find(d => d.departmentId === id)?.counts;
    expect(dept("kitchen")).toEqual({ onTime: 1, late: 1, missed: 2 });
    expect(dept("bar")).toEqual({ onTime: 0, late: 0, missed: 1 });
    expect(dept(null)).toEqual({ onTime: 1, late: 0, missed: 1 });
  });

  it("aggregates missed reasons, with unexplained misses as null", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: noScope });
    expect(r.reasons).toEqual([{ reason: "short_staffed", count: 2 }, { reason: null, count: 1 }]);
  });

  it("lists misses newest first with the location name", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: noScope });
    expect(r.misses.map(m => m.id)).toEqual(["m2", "m1", "m3"]);
    expect(r.misses[1].locationName).toBe("Cafe A");
  });

  it("narrows by location", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: { locationIds: ["b"], departmentIds: null } });
    expect(r.totals).toEqual({ onTime: 1, late: 0, missed: 2 });
  });

  it("narrows by department but keeps checklists that apply to every department", () => {
    const r = buildTimingReport({ logs, misses, checklists, locations, scope: { locationIds: null, departmentIds: ["bar"] } });
    expect(r.totals).toEqual({ onTime: 1, late: 0, missed: 2 });
  });
});

describe("pctOf", () => {
  it("rounds and handles an empty report", () => {
    expect(pctOf(1, { onTime: 1, late: 1, missed: 1 })).toBe(33);
    expect(pctOf(0, { onTime: 0, late: 0, missed: 0 })).toBe(0);
  });
});
