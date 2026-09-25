// Tracks who's currently signed in at the kiosk grid (#780). The grid is
// filtered to that person's department(s), and since #869 it's also who a
// checklist or the Library is opened as — one PIN per session, no second
// prompt per checklist. Ends on the grid's 90s idle timeout. See kiosk-admin-session.ts for the (much
// higher-stakes) full-app-access grant, which this deliberately does not
// reuse or extend.

const KIOSK_STAFF_SESSION_KEY = "kiosk_staff_session";
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface KioskStaffSession {
  staffId: string | null;
  memberId?: string | null;
  staffName: string;
  organizationId: string;
  departmentIds: string[];
  expiresAt: number;
}

export function grantKioskStaffSession(
  session: { staffId: string | null; memberId?: string | null; staffName: string; organizationId: string; departmentIds: string[] },
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
