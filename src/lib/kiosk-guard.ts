// A device that has completed kiosk setup (kiosk_location_id present in
// localStorage) must never surface the marketing/auth entry points. The
// kiosk intentionally runs on the anon key (see Kiosk.tsx), but the admin
// session used to configure it in the first place is left signed in on the
// device — the in-kiosk Admin PIN flow (AdminLoginModal -> /admin?from=kiosk)
// depends on that lingering session to work. If the browser ever ends up
// back on "/" or "/login" (a hard refresh, a GitHub Pages 404 fallback
// hiccup, etc.), that same lingering session lets anyone tap "Sign In" and
// land straight in /admin with no credentials at all. Bouncing these routes
// back to /kiosk keeps the only path into admin the PIN-gated one.
const KIOSK_ESCAPE_ROUTES = new Set(["/", "/login", "/signup"]);

export function shouldRedirectToKiosk(pathname: string, hasKioskLocation: boolean): boolean {
  return hasKioskLocation && KIOSK_ESCAPE_ROUTES.has(pathname);
}

// The localStorage keys that mark this browser as a configured kiosk
// device (see Kiosk.tsx). Single source of truth so every call site that
// needs to fully un-register a device — the Admin "Exit kiosk mode" control
// (#633) included — clears the same set.
export const KIOSK_DEVICE_STORAGE_KEYS = [
  "kiosk_location_id",
  "kiosk_location_name",
  "kiosk_token",
  "kiosk_owner_user_id",
  "kiosk_owner_org_id",
] as const;

export function clearKioskDeviceState(): void {
  for (const key of KIOSK_DEVICE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}
