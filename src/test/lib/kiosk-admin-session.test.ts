import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  grantKioskAdminSession,
  readKioskAdminSession,
  hasActiveKioskAdminSession,
  clearKioskAdminSession,
} from "@/lib/kiosk-admin-session";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("kiosk-admin-session", () => {
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
});
