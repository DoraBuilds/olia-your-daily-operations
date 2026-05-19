// ─── Admin Data Types & Mock Repository ─────────────────────────────────────
// Isolated data access layer — swap to DB later without rewriting UI.

export type AccountRole = "Owner" | "Manager";
export type StaffStatus = "active" | "archived";

export interface StaffDepartment {
  name: string;
}

export const DEFAULT_STAFF_DEPARTMENTS: StaffDepartment[] = [
  { name: "Front of House" },
  { name: "Back of House" },
  { name: "Management" },
  { name: "Cleaning Crew" },
];

export function flattenStaffDepartments(departments: StaffDepartment[]): string[] {
  return departments.map((department) => department.name);
}

const LEGACY_ROLE_DEPARTMENT_MAP: Record<string, string> = {
  Waiter: "Front of House",
  Bartender: "Front of House",
  Host: "Front of House",
  Kitchen: "Back of House",
  Cleaner: "Cleaning Crew",
  Manager: "Management",
};

export function getRoleDepartment(role: string): string {
  const baseRole = role.split(" / ")[0]?.trim() || role;
  return LEGACY_ROLE_DEPARTMENT_MAP[baseRole] ?? baseRole;
}

export const DEFAULT_STAFF_ROLES = flattenStaffDepartments(DEFAULT_STAFF_DEPARTMENTS);

export interface ManagerPermissions {
  create_edit_checklists: boolean;
  assign_checklists: boolean;
  manage_staff_profiles: boolean;
  view_reporting: boolean;
  edit_location_details: boolean;
  manage_alerts: boolean;
  export_data: boolean;
  override_inactivity_threshold: boolean;
}

export const DEFAULT_PERMISSIONS: ManagerPermissions = {
  create_edit_checklists: true,
  assign_checklists: true,
  manage_staff_profiles: true,
  view_reporting: true,
  edit_location_details: true,
  manage_alerts: true,
  export_data: true,
  override_inactivity_threshold: true,
};

export interface Location {
  id: string;
  name: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  trading_hours: string;
  archive_threshold_days: number;
  created_at?: string;
  // Google Maps / Places fields (populated by autocomplete)
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
}

export interface StaffProfile {
  id: string;
  location_id: string;
  first_name: string;
  last_name: string;
  role: string;
  status: StaffStatus;
  pin: string;
  email?: string | null;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  location_ids: string[];
  initials: string;
  permissions: ManagerPermissions;
  /** PIN is never returned from the server — only used transiently when saving. */
  pin?: undefined;
  pin_reset_required?: boolean;
}

export interface AuditLogEntry {
  id: string;
  user: string;
  action: string;
  location_id: string | null;
  location_name: string | null;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export const DEFAULT_ADMIN_PIN = "1234";

export function getInitials(name: string): string {
  return name
    .trim()
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function daysAgo(isoDate: string | null): string {
  if (!isoDate) return "Never used";
  const d = new Date(isoDate);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); // "23 Mar"
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); // "14:39"
  return `Last used: ${day}, ${time}`;
}

/** Full timestamp with seconds — used as tooltip title */
export function daysAgoTooltip(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }); // "23 Mar 2026, 14:39:05"
}

export function staffDisplayName(p: StaffProfile): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

