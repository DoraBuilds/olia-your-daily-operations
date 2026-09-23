import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  grantKioskAdminSession,
  readKioskAdminSession,
  hasActiveKioskAdminSession,
  clearKioskAdminSession,
  subscribeKioskAdminSession,
} from "@/lib/kiosk-admin-session";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("kiosk_location_id", "location-1");
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.removeItem("kiosk_location_id");
  vi.useRealTimers();
});

describe("kiosk-admin-session", () => {
  // Regression (#832): a grant left over after this browser stopped being a
  // kiosk kept Layout's idle timer bouncing a normal admin back to /kiosk.
  it("ignores and drops a grant once this browser is no longer a kiosk device", () => {
    grantKioskAdminSession("user-1", "location-1");
    localStorage.removeItem("kiosk_location_id");
    expect(hasActiveKioskAdminSession()).toBe(false);
    expect(sessionStorage.getItem("kiosk_admin_session")).toBeNull();
  });

  it("grants a session that reads back with the same userId and locationId", () => {
    grantKioskAdminSession("user-1", "location-1");
    expect(readKioskAdminSession()).toMatchObject({ userId: "user-1", locationId: "location-1" });
    expect(hasActiveKioskAdminSession()).toBe(true);
  });

  it("reads are non-destructive — the grant survives repeated reads", () => {
    grantKioskAdminSession("user-1", "location-1");
    readKioskAdminSession();
    readKioskAdminSession();
    expect(readKioskAdminSession()).not.toBeNull();
  });

  it("reports no active session when nothing was ever granted", () => {
    expect(readKioskAdminSession()).toBeNull();
    expect(hasActiveKioskAdminSession()).toBe(false);
  });

  it("expires the grant after its TTL and clears the stored entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    grantKioskAdminSession("user-1", "location-1", 1000);

    vi.setSystemTime(1500);
    expect(readKioskAdminSession()).toBeNull();
    expect(sessionStorage.getItem("kiosk_admin_session")).toBeNull();
  });

  it("treats a malformed stored value as no session and clears it", () => {
    sessionStorage.setItem("kiosk_admin_session", "not-json");
    expect(readKioskAdminSession()).toBeNull();
    expect(sessionStorage.getItem("kiosk_admin_session")).toBeNull();
  });

  it("clearKioskAdminSession revokes an active grant", () => {
    grantKioskAdminSession("user-1", "location-1");
    clearKioskAdminSession();
    expect(hasActiveKioskAdminSession()).toBe(false);
  });

  // Layout.tsx's inactivity timer relies on subscribeKioskAdminSession to
  // learn about a grant/clear the instant it happens elsewhere in the tree
  // (e.g. Admin's "Exit kiosk mode" control), not just on its own next
  // render (#727).
  describe("subscribeKioskAdminSession", () => {
    it("notifies subscribers when a session is granted", () => {
      const listener = vi.fn();
      subscribeKioskAdminSession(listener);
      grantKioskAdminSession("user-1", "location-1");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies subscribers when a session is cleared", () => {
      grantKioskAdminSession("user-1", "location-1");
      const listener = vi.fn();
      subscribeKioskAdminSession(listener);
      clearKioskAdminSession();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stops notifying after unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeKioskAdminSession(listener);
      unsubscribe();
      grantKioskAdminSession("user-1", "location-1");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
