// ─── Admin Data Types & Mock Repository ─────────────────────────────────────
// Isolated data access layer — swap to DB later without rewriting UI.

export type AccountRole = "Owner" | "Manager";
export type StaffStatus = "active" | "archived";

export const DEFAULT_STAFF_ROLES = [
  "Waiter", "Kitchen", "Bartender", "Manager", "Host", "Cleaner",
];

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
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (diff === 0) return "Used today";
  if (diff === 1) return "Last used: 1 day ago";
  return `Last used: ${diff} days ago`;
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

// ─── Initial Mock Data ───────────────────────────────────────────────────────

export const initialLocations: Location[] = [
  {
    id: "l1",
    name: "Main Branch",
    address: "14 Rue de la Paix, Lyon, France",
    contact_email: "main@olia.app",
    contact_phone: "+33 4 78 00 11 22",
    trading_hours: "Mon–Sat 08:00–22:00, Sun 10:00–18:00",
    archive_threshold_days: 90,
  },
  {
    id: "l2",
    name: "Terrace",
    address: "14 Rue de la Paix (outdoor), Lyon, France",
    contact_email: "terrace@olia.app",
    contact_phone: "+33 4 78 00 11 23",
    trading_hours: "Apr–Oct: Daily 11:00–21:00",
    archive_threshold_days: 60,
  },
];

export const initialStaffProfiles: StaffProfile[] = [
  {
    id: "sp1",
    location_id: "l1",
    first_name: "Maria",
    last_name: "Garcia",
    role: "Waiter",
    status: "active",
    pin: "1234",
    last_used_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    archived_at: null,
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: "sp2",
    location_id: "l1",
    first_name: "Tariq",
    last_name: "Nasser",
    role: "Bartender",
    status: "active",
    pin: "5678",
    last_used_at: new Date(Date.now()).toISOString(),
    archived_at: null,
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: "sp3",
    location_id: "l1",
    first_name: "Lena",
    last_name: "Schmidt",
    role: "Kitchen",
    status: "active",
    pin: "2468",
    last_used_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    archived_at: null,
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
  },
  {
    id: "sp4",
    location_id: "l1",
    first_name: "Omar",
    last_name: "Boukhari",
    role: "Host",
    status: "active",
    pin: "1357",
    last_used_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    archived_at: null,
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
  {
    id: "sp5",
    location_id: "l2",
    first_name: "Sofia",
    last_name: "Andersen",
    role: "Waiter",
    status: "active",
    pin: "9012",
    last_used_at: null,
    archived_at: null,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "sp6",
    location_id: "l2",
    first_name: "Jan",
    last_name: "Kowalski",
    role: "Cleaner",
    status: "archived",
    pin: "3579",
    last_used_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    archived_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
  },
];

export const initialTeamMembers: TeamMember[] = [
  {
    id: "u1",
    name: "Elena Rossi",
    email: "elena@olia.app",
    role: "Owner",
    location_ids: ["l1", "l2"],
    initials: "ER",
    permissions: { ...DEFAULT_PERMISSIONS },
  },
  {
    id: "u2",
    name: "Marc Devaux",
    email: "marc@olia.app",
    role: "Manager",
    location_ids: ["l1"],
    initials: "MD",
    permissions: {
      create_edit_checklists: true,
      assign_checklists: true,
      manage_staff_profiles: true,
      view_reporting: true,
      edit_location_details: false,
      manage_alerts: false,
      export_data: true,
      override_inactivity_threshold: false,
    },
  },
  {
    id: "u3",
    name: "Chloe Brandt",
    email: "chloe@olia.app",
    role: "Manager",
    location_ids: ["l2"],
    initials: "CB",
    permissions: { ...DEFAULT_PERMISSIONS },
  },
];

export const initialAuditLog: AuditLogEntry[] = [
  {
    id: "a1",
    user: "Elena Rossi",
    action: "Added staff profile: Maria Garcia",
    location_id: "l1",
    location_name: "Main Branch",
    timestamp: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "a2",
    user: "Marc Devaux",
    action: "Archived staff profile: Jan Kowalski",
    location_id: "l2",
    location_name: "Terrace",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "a3",
    user: "Elena Rossi",
    action: "Updated location details",
    location_id: "l1",
    location_name: "Main Branch",
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "a4",
    user: "Chloe Brandt",
    action: "Updated archive threshold to 60 days",
    location_id: "l2",
    location_name: "Terrace",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "a5",
    user: "Elena Rossi",
    action: "Invited team member: Chloe Brandt",
    location_id: null,
    location_name: null,
    timestamp: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "a6",
    user: "Marc Devaux",
    action: "Created checklist: Opening Checklist",
    location_id: "l1",
    location_name: "Main Branch",
    timestamp: new Date(Date.now() - 86400000 * 0.5).toISOString(),
  },
];
