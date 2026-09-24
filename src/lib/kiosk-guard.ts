import { supabase } from "@/lib/supabase";
import { clearKioskAdminSession } from "@/lib/kiosk-admin-session";

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
  // The fleet-registry identity (#818) — a separate device row per physical
  // tablet, independent of the location-level kiosk_token above. Included
  // here so "Exit kiosk mode" fully un-registers the device too.
  "kiosk_device_id",
  "kiosk_device_token",
  // Which location kiosk_device_token was issued for (set by
  // pairKioskDevice in kiosk-pairing.ts).
  "kiosk_device_location_id",
] as const;

export function clearKioskDeviceState(): void {
  for (const key of KIOSK_DEVICE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  // No longer a kiosk -> any kiosk-PIN admin grant (and its idle timer in
  // Layout.tsx) must end too, or it keeps redirecting to /kiosk (#832).
  clearKioskAdminSession();
}

// ─── touchKioskDevice ─────────────────────────────────────────────────────────
// Heartbeat + remote-revocation check. Called on an interval from Kiosk.tsx
// itself, and once on mount from ConceptsTab.tsx's "this browser is a kiosk"
// banner (#824) so that banner doesn't keep showing stale after the device
// was deactivated from Admin -> Kiosks on this same browser, or from
// elsewhere. Lives here rather than in PinEntryModal.tsx (pure logic, no
// dependency on the kiosk PIN-modal UI) so ConceptsTab — part of the Admin
// bundle, not the Kiosk bundle — can call it without pulling in that UI.
// Returns false only when the device was deactivated; any other outcome (no
// device registered yet, or a network error) is treated as "still fine to
// run" so a blip never locks out a working kiosk.
export async function touchKioskDevice(): Promise<boolean> {
  const token = localStorage.getItem("kiosk_device_token");
  if (!token) return true;
  try {
    const { data, error } = await supabase.rpc("touch_kiosk_device", { p_device_token: token });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
