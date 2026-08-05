// The kiosk's "Admin PIN" flow (AdminLoginModal in src/pages/kiosk/PinEntryModal.tsx)
// grants temporary elevated access to the whole authenticated app from a
// device that otherwise runs fully unauthenticated. This session token is the
// ONLY thing that's allowed to stand in for real credentials on a kiosk
// device (see kiosk-guard.ts and ProtectedRoute.tsx) — so it must survive
// exactly as long as intended and no longer.
//
// Day-to-day, Layout.tsx's inactivity timer is what actually bounds the
// grant: it resets on every interaction anywhere in the app and forces a
// return to /kiosk after 90s idle. The expiry here is just the outer safety
// net for the case that timer never gets a chance to fire (a stuck tab, a JS
// error, a device carried out of range mid-session) — generous enough not to
// cut off a real admin task, but not "forever".

const KIOSK_ADMIN_SESSION_KEY = "kiosk_admin_session";
const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface KioskAdminSession {
  userId: string;
  locationId: string;
  expiresAt: number;
}

export function grantKioskAdminSession(userId: string, locationId: string, ttlMs = DEFAULT_TTL_MS): void {
  const session: KioskAdminSession = { userId, locationId, expiresAt: Date.now() + ttlMs };
  sessionStorage.setItem(KIOSK_ADMIN_SESSION_KEY, JSON.stringify(session));
}

// Non-destructive: callers may read this repeatedly (e.g. on every re-render
// after Admin.tsx's tab-switch remounts) without consuming the grant early.
export function readKioskAdminSession(): KioskAdminSession | null {
  const raw = sessionStorage.getItem(KIOSK_ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<KioskAdminSession>;
    if (!session.userId || !session.locationId || !session.expiresAt || Date.now() >= session.expiresAt) {
      sessionStorage.removeItem(KIOSK_ADMIN_SESSION_KEY);
      return null;
    }
    return session as KioskAdminSession;
  } catch {
    sessionStorage.removeItem(KIOSK_ADMIN_SESSION_KEY);
    return null;
  }
}

export function hasActiveKioskAdminSession(): boolean {
  return readKioskAdminSession() !== null;
}

export function clearKioskAdminSession(): void {
  sessionStorage.removeItem(KIOSK_ADMIN_SESSION_KEY);
}
