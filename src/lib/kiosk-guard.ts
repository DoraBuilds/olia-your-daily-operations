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
