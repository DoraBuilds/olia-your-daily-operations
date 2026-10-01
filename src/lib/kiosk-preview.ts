import { supabase } from "@/lib/supabase";
import { KIOSK_DEVICE_STORAGE_KEYS } from "@/lib/kiosk-guard";

// Admin -> Devices -> "Test kiosk": lets an owner try a kiosk screen in the
// browser they're already using WITHOUT pairing it. Nothing is written to the
// device row and no device token is ever handed out; the browser only gets the
// location to display. The kiosk_* keys it borrows are snapshotted first and
// put back when test mode ends — explicitly (Exit test mode), or on the next
// page load in a tab that isn't the one that started it (closed tab, new
// session) — so a test can never leave this browser connected to a kiosk, and
// a browser that already IS a real kiosk goes back to being that kiosk.

const SNAPSHOT_KEY = "kiosk_preview_snapshot";
const ACTIVE_KEY = "kiosk_preview_active"; // sessionStorage: per-tab

export function isKioskPreviewActive(): boolean {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface StartKioskPreviewResult {
  ok: boolean;
}

export async function startKioskPreview(deviceId: string): Promise<StartKioskPreviewResult> {
  const { data, error } = await supabase.rpc("preview_kiosk_device", { p_device_id: deviceId });
  if (error) return { ok: false };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { ok: false };

  // Never overwrite an existing snapshot: that would make the test identity
  // look like the browser's real one.
  if (localStorage.getItem(SNAPSHOT_KEY) === null) {
    const snapshot: Record<string, string> = {};
    for (const key of KIOSK_DEVICE_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  }
  for (const key of KIOSK_DEVICE_STORAGE_KEYS) localStorage.removeItem(key);

  localStorage.setItem("kiosk_location_id", row.location_id);
  localStorage.setItem("kiosk_location_name", row.location_name ?? "");
  if (row.kiosk_token) localStorage.setItem("kiosk_token", row.kiosk_token);
  sessionStorage.setItem(ACTIVE_KEY, "1");
  return { ok: true };
}

/** Ends test mode and restores whatever kiosk identity this browser had before (usually none). */
export function endKioskPreview(): void {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (raw === null) {
    sessionStorage.removeItem(ACTIVE_KEY);
    return;
  }
  for (const key of KIOSK_DEVICE_STORAGE_KEYS) localStorage.removeItem(key);
  try {
    const snapshot = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
  } catch { /* corrupt snapshot -> leave the browser a plain browser */ }
  localStorage.removeItem(SNAPSHOT_KEY);
  sessionStorage.removeItem(ACTIVE_KEY);
}

/**
 * Run once at startup, before anything reads kiosk_location_id: a snapshot
 * with no live test-mode tab means the test was abandoned, so undo it.
 */
export function recoverAbandonedKioskPreview(): void {
  if (localStorage.getItem(SNAPSHOT_KEY) !== null && !isKioskPreviewActive()) endKioskPreview();
}
