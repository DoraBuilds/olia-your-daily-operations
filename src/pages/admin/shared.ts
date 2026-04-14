// ─── Shared constants, types, and helpers for the Admin page ─────────────────
// Used by both MyLocationTab and AccountTab (and the modals they render).

import {
  type ManagerPermissions, type StaffDepartment,
  getRoleDepartment,
} from "@/lib/admin-repository";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PERM_LABELS: Record<keyof ManagerPermissions, string> = {
  create_edit_checklists: "Create & edit checklists",
  assign_checklists: "Assign checklists",
  manage_staff_profiles: "Manage staff profiles",
  view_reporting: "View reporting",
  edit_location_details: "Edit location details",
  manage_alerts: "Manage alerts",
  export_data: "Export data",
  override_inactivity_threshold: "Override inactivity threshold",
};

export const ROLE_COLOR_MAP: Record<string, string> = {
  "Front of House": "bg-sage-light text-sage-deep",
  "Back of House": "bg-lavender-light text-lavender-deep",
  Management: "status-warn",
  "Cleaning Crew": "bg-muted text-muted-foreground",
  Waiter: "bg-sage-light text-sage-deep",
  Kitchen: "bg-lavender-light text-lavender-deep",
  Bartender: "status-warn",
  Manager: "status-warn",
  Host: "status-ok",
  Cleaner: "bg-muted text-muted-foreground",
};

// ─── Opening hours types ──────────────────────────────────────────────────────

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface TimeWindow { start: string; end: string; }
export interface DayHours { open: boolean; windows: TimeWindow[]; }
export type WeeklyHours = Record<DayKey, DayHours>;

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
export const DEFAULT_HOURS: WeeklyHours = {
  mon: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  tue: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  wed: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  thu: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  fri: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  sat: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  sun: { open: false, windows: [] },
};

export function cloneDayHours(hours: DayHours): DayHours {
  return {
    open: hours.open,
    windows: hours.windows.map(window => ({ ...window })),
  };
}

export function cloneWeeklyHours(hours: WeeklyHours): WeeklyHours {
  return DAY_KEYS.reduce((acc, day) => {
    acc[day] = cloneDayHours(hours[day]);
    return acc;
  }, {} as WeeklyHours);
}

export function normalizeDayHours(rawDay: unknown, fallback: DayHours): DayHours {
  if (!rawDay || typeof rawDay !== "object") return cloneDayHours(fallback);
  const day = rawDay as Partial<DayHours> & { start?: string; end?: string };
  if (Array.isArray(day.windows)) {
    const windows = day.windows
      .map(window => ({
        start: typeof window?.start === "string" ? window.start : fallback.windows[0]?.start ?? "08:00",
        end: typeof window?.end === "string" ? window.end : fallback.windows[0]?.end ?? "22:00",
      }))
      .filter(window => window.start && window.end)
      .slice(0, 2);
    return {
      open: Boolean(day.open),
      windows: day.open ? (windows.length > 0 ? windows : cloneDayHours(fallback).windows) : [],
    };
  }
  if (typeof day.start === "string" || typeof day.end === "string") {
    return {
      open: Boolean(day.open ?? true),
      windows: (day.open ?? true)
        ? [{
            start: day.start ?? fallback.windows[0]?.start ?? "08:00",
            end: day.end ?? fallback.windows[0]?.end ?? "22:00",
          }]
        : [],
    };
  }
  return cloneDayHours(fallback);
}

export function parseHours(raw: string | null | undefined): WeeklyHours {
  if (!raw) return cloneWeeklyHours(DEFAULT_HOURS);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "mon" in parsed) {
      return DAY_KEYS.reduce((acc, day) => {
        acc[day] = normalizeDayHours((parsed as Record<string, unknown>)[day], DEFAULT_HOURS[day]);
        return acc;
      }, {} as WeeklyHours);
    }
  } catch { /* not JSON — old plain-text value */ }
  return cloneWeeklyHours(DEFAULT_HOURS);
}

export function formatHoursText(hours: WeeklyHours): string {
  const openDays = DAY_KEYS.filter(d => hours[d].open);
  if (!openDays.length) return "Closed all week";
  return openDays
    .map(d => `${DAY_LABELS[d]}: ${hours[d].windows.map(window => `${window.start}–${window.end}`).join(" / ")}`)
    .join(" · ");
}

const GOOGLE_DAY_LABELS: Record<string, DayKey> = {
  Sunday: "sun",
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat",
};

function parseGoogleTimeTo24Hour(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ?? "00";
  const meridiem = match[3]?.toUpperCase();

  if (Number.isNaN(hours) || hours < 0 || hours > 23) return null;
  if (Number.isNaN(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 59) return null;

  if (meridiem === "AM") {
    if (hours === 12) hours = 0;
  } else if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function parseGoogleOpeningWindow(rawWindow: string): TimeWindow | null {
  const match = rawWindow.trim().match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (!match) return null;

  const start = parseGoogleTimeTo24Hour(match[1]);
  const end = parseGoogleTimeTo24Hour(match[2]);
  if (!start || !end) return null;

  return { start, end };
}

export function parseGoogleOpeningHours(weekdayText: string[] | null | undefined): WeeklyHours | null {
  if (!weekdayText?.length) return null;

  const parsed = cloneWeeklyHours(DEFAULT_HOURS);
  let matchedAnyDay = false;

  for (const entry of weekdayText) {
    const match = entry.match(/^([^:]+):\s*(.+)$/);
    const label = match?.[1]?.trim() ?? "";
    const schedule = match?.[2]?.trim() ?? "";
    const day = GOOGLE_DAY_LABELS[label];
    if (!day || !schedule) continue;

    matchedAnyDay = true;
    const trimmedSchedule = schedule.trim();
    if (/^closed$/i.test(trimmedSchedule)) {
      parsed[day] = { open: false, windows: [] };
      continue;
    }

    if (/open 24 hours/i.test(trimmedSchedule)) {
      parsed[day] = { open: true, windows: [{ start: "00:00", end: "23:59" }] };
      continue;
    }

    const windows = trimmedSchedule
      .split(/\s*,\s*/)
      .map(segment => parseGoogleOpeningWindow(segment))
      .filter((window): window is TimeWindow => window !== null);

    if (windows.length > 0) {
      parsed[day] = { open: true, windows: windows.slice(0, 2) };
    }
  }

  return matchedAnyDay ? parsed : null;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function cloneDepartments(departments: StaffDepartment[]): StaffDepartment[] {
  return departments.map((department) => ({ name: department.name }));
}

export function roleUsesDepartment(role: string, departmentName: string): boolean {
  return getRoleDepartment(role) === departmentName;
}
