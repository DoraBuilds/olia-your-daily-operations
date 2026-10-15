// Checklist timing report: on time / late / missed by location and
// department, plus why things were missed. Pure so it can be tested without
// the network. Completions are stamped on_time/late by the kiosk at submit
// time; misses are recorded server-side (checklist_misses).

export type TimingStatus = "on_time" | "late";
export type MissReason = "short_staffed" | "equipment_issue" | "forgot" | "other";
export const MISS_REASONS: MissReason[] = ["short_staffed", "equipment_issue", "forgot", "other"];
export type MissRoute = "window_close" | "after_overdue";

export interface TimingLog {
  id: string;
  checklist_id: string | null;
  location_id: string | null;
  timing_status: TimingStatus | null;
  created_at: string;
}

export interface TimingProgressItem { label: string; type: string; section?: string; done: boolean; answer: string }
/** How far a checklist got before it was missed (kiosk reported it as it went). */
export interface TimingProgress { answered: number; total: number; items: TimingProgressItem[] }

export interface TimingMiss {
  id: string;
  checklist_id: string;
  checklist_title: string;
  location_id: string;
  operating_date: string;
  route: MissRoute;
  window_from: string | null;
  window_until: string | null;
  reason: MissReason | null;
  note: string | null;
  note_by: string | null;
  note_at: string | null;
  progress?: TimingProgress | null;
}

export interface TimingChecklist {
  id: string;
  /** null = every department. */
  department_ids?: string[] | null;
}

export interface TimingCounts { onTime: number; late: number; missed: number }

export interface TimingScope {
  /** null = every location. */
  locationIds: string[] | null;
  /** null = every department. */
  departmentIds: string[] | null;
}

export interface TimingReport {
  totals: TimingCounts;
  byLocation: { locationId: string; name: string; counts: TimingCounts }[];
  /** departmentId null = checklists that apply to every department. */
  byDepartment: { departmentId: string | null; counts: TimingCounts }[];
  /** reason null = a miss nobody explained. */
  reasons: { reason: MissReason | null; count: number }[];
  misses: (TimingMiss & { locationName: string })[];
}

const empty = (): TimingCounts => ({ onTime: 0, late: 0, missed: 0 });

export function totalCount(c: TimingCounts) {
  return c.onTime + c.late + c.missed;
}

/** Whole-number percentage of `part` in `c`, 0 when there is nothing. */
export function pctOf(part: number, c: TimingCounts) {
  const total = totalCount(c);
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function buildTimingReport(input: {
  logs: TimingLog[];
  misses: TimingMiss[];
  checklists: TimingChecklist[];
  locations: { id: string; name: string }[];
  scope: TimingScope;
}): TimingReport {
  const { logs, misses, checklists, locations, scope } = input;
  const deptsOf = new Map(checklists.map(c => [c.id, c.department_ids ?? null]));
  const locationName = new Map(locations.map(l => [l.id, l.name]));

  const inScope = (locationId: string | null, checklistId: string | null) => {
    if (scope.locationIds && (!locationId || !scope.locationIds.includes(locationId))) return false;
    if (scope.departmentIds) {
      const depts = checklistId ? deptsOf.get(checklistId) ?? null : null;
      // A checklist with no department applies to everyone, so it stays in.
      if (depts && !depts.some(d => scope.departmentIds!.includes(d))) return false;
    }
    return true;
  };

  const totals = empty();
  const byLocation = new Map<string, TimingCounts>();
  const byDepartment = new Map<string | null, TimingCounts>();
  const reasonCounts = new Map<MissReason | null, number>();

  const add = (kind: keyof TimingCounts, locationId: string | null, checklistId: string | null) => {
    totals[kind]++;
    if (locationId && locationName.has(locationId)) {
      const c = byLocation.get(locationId) ?? empty();
      c[kind]++;
      byLocation.set(locationId, c);
    }
    const depts = checklistId ? deptsOf.get(checklistId) ?? null : null;
    for (const d of depts && depts.length > 0 ? depts : [null]) {
      const c = byDepartment.get(d) ?? empty();
      c[kind]++;
      byDepartment.set(d, c);
    }
  };

  for (const log of logs) {
    if (!log.timing_status || !inScope(log.location_id, log.checklist_id)) continue;
    add(log.timing_status === "on_time" ? "onTime" : "late", log.location_id, log.checklist_id);
  }

  const scopedMisses = misses.filter(m => inScope(m.location_id, m.checklist_id));
  for (const m of scopedMisses) {
    add("missed", m.location_id, m.checklist_id);
    reasonCounts.set(m.reason, (reasonCounts.get(m.reason) ?? 0) + 1);
  }

  return {
    totals,
    byLocation: [...byLocation.entries()]
      .map(([locationId, counts]) => ({ locationId, name: locationName.get(locationId) ?? "", counts }))
      .sort((a, b) => totalCount(b.counts) - totalCount(a.counts) || a.name.localeCompare(b.name)),
    byDepartment: [...byDepartment.entries()]
      .map(([departmentId, counts]) => ({ departmentId, counts }))
      .sort((a, b) => totalCount(b.counts) - totalCount(a.counts)),
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    misses: scopedMisses
      .map(m => ({ ...m, locationName: locationName.get(m.location_id) ?? "" }))
      .sort((a, b) => b.operating_date.localeCompare(a.operating_date) || a.checklist_title.localeCompare(b.checklist_title)),
  };
}
