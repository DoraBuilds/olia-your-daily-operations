import { supabase } from "@/lib/supabase";
import { grantKioskAdminSession, clearKioskAdminSession } from "@/lib/kiosk-admin-session";

// ─── Kiosk pairing codes (#861) ───────────────────────────────────────────────
// An owner creates a kiosk for a location in Admin, which issues a one-time
// 8-character code. On the tablet, Login -> "Kiosk" tab takes that code and
// turns the browser into that kiosk. Codes are stored without the dash and
// shown as XXXX-XXXX; the alphabet has no look-alikes (0/O, 1/I/L).

export const PAIRING_CODE_LENGTH = 8;
const PAIRING_ALPHABET = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;

/** Uppercases and strips everything that can't be part of a code. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(PAIRING_ALPHABET, "").slice(0, PAIRING_CODE_LENGTH);
}

/** "ABCD2345" -> "ABCD-2345" (partial input is formatted as far as it goes). */
export function formatPairingCode(code: string): string {
  const clean = normalizePairingCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

// Flat (not a discriminated union): strictNullChecks is off in this repo,
// so `if (!result.ok)` wouldn't narrow a union.
export interface PairKioskResult {
  ok: boolean;
  reason?: "invalid_code" | "network";
  locationId?: string;
  locationName?: string;
}

/**
 * Redeems a pairing code and stores the device identity in localStorage —
 * the same keys Kiosk.tsx has always read (see KIOSK_DEVICE_STORAGE_KEYS in
 * kiosk-guard.ts), so everything downstream of "this browser is a kiosk"
 * works unchanged.
 */
export async function pairKioskDevice(code: string): Promise<PairKioskResult> {
  const { data, error } = await supabase.rpc("pair_kiosk_device", { p_code: normalizePairingCode(code) });
  if (error) return { ok: false, reason: "network" };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { ok: false, reason: "invalid_code" };

  localStorage.setItem("kiosk_location_id", row.location_id);
  localStorage.setItem("kiosk_location_name", row.location_name ?? "");
  if (row.kiosk_token) localStorage.setItem("kiosk_token", row.kiosk_token);
  else localStorage.removeItem("kiosk_token");
  localStorage.setItem("kiosk_device_id", row.device_id);
  localStorage.setItem("kiosk_device_token", row.device_token);
  localStorage.setItem("kiosk_device_location_id", row.location_id);
  // Left over from the old "set up while signed in" flow — meaningless now.
  localStorage.removeItem("kiosk_owner_user_id");
  localStorage.removeItem("kiosk_owner_org_id");
  return { ok: true, locationId: row.location_id, locationName: row.location_name ?? "" };
}

export interface KioskAdminLoginResult {
  ok: boolean;
  reason?: "invalid_pin" | "rate_limited" | "device_inactive" | "not_paired" | "error";
  teamMemberId?: string;
}

/**
 * The in-kiosk Admin PIN (#861): trades this device's token + an owner's
 * Admin PIN for a real session for that owner (kiosk-admin-login edge
 * function). The tablet itself never stores account credentials; Kiosk.tsx
 * signs the session out again once the admin grant is over. On success the
 * kiosk admin grant is already in place — the caller just navigates.
 */
export async function kioskAdminLogin(pin: string, locationId: string): Promise<KioskAdminLoginResult> {
  const deviceToken = localStorage.getItem("kiosk_device_token");
  if (!deviceToken) return { ok: false, reason: "not_paired" };

  const { data, error } = await supabase.functions.invoke("kiosk-admin-login", {
    body: { device_token: deviceToken, pin },
  });
  if (error || !data) return { ok: false, reason: "error" };
  if (data.error) {
    const known = ["invalid_pin", "rate_limited", "device_inactive"] as const;
    const reason = (known as readonly string[]).includes(data.error) ? data.error : "error";
    return { ok: false, reason };
  }

  // Grant BEFORE the session lands: Kiosk.tsx signs out any session it sees
  // without a live grant, and the SIGNED_IN event can re-render it first.
  grantKioskAdminSession(data.team_member_id, locationId);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) {
    clearKioskAdminSession();
    return { ok: false, reason: "error" };
  }
  return { ok: true, teamMemberId: data.team_member_id };
}
