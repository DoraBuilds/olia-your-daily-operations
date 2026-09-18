// Tracks who's currently browsing the kiosk grid, purely so the grid can be
// filtered to that person's department(s) (#780). This is NOT an attribution
// or access-control mechanism — completing a checklist still requires its own
// separate PIN entry (PinEntryModal), unchanged. A device left unlocked here
// only changes which checklists are *listed*, nothing about what gets logged
// or who's credited for it. See kiosk-admin-session.ts for the (much
// higher-stakes) full-app-access grant, which this deliberately does not
// reuse or extend.

const KIOSK_STAFF_SESSION_KEY = "kiosk_staff_session";
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface KioskStaffSession {
  staffId: string | null;
  staffName: string;
  organizationId: string;
  departmentIds: string[];
  expiresAt: number;
}

export function grantKioskStaffSession(
  session: { staffId: string | null; staffName: string; organizationId: string; departmentIds: string[] },
  ttlMs = DEFAULT_TTL_MS,
): void {
  const stored: KioskStaffSession = { ...session, expiresAt: Date.now() + ttlMs };
  sessionStorage.setItem(KIOSK_STAFF_SESSION_KEY, JSON.stringify(stored));
}

// Non-destructive: callers may read this repeatedly without consuming it early.
export function readKioskStaffSession(): KioskStaffSession | null {
  const raw = sessionStorage.getItem(KIOSK_STAFF_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<KioskStaffSession>;
    if (!session.staffName || !session.organizationId || !session.expiresAt || Date.now() >= session.expiresAt) {
      sessionStorage.removeItem(KIOSK_STAFF_SESSION_KEY);
      return null;
    }
    return session as KioskStaffSession;
  } catch {
    sessionStorage.removeItem(KIOSK_STAFF_SESSION_KEY);
    return null;
  }
}

export function clearKioskStaffSession(): void {
  sessionStorage.removeItem(KIOSK_STAFF_SESSION_KEY);
}
