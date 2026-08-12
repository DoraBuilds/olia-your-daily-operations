import { describe, it, expect, beforeEach } from "vitest";
import { shouldRedirectToKiosk, clearKioskDeviceState, KIOSK_DEVICE_STORAGE_KEYS } from "@/lib/kiosk-guard";

describe("shouldRedirectToKiosk", () => {
  it("redirects the landing page back to the kiosk once kiosk mode is configured", () => {
    expect(shouldRedirectToKiosk("/", true)).toBe(true);
  });

  it("redirects /login back to the kiosk once kiosk mode is configured", () => {
    expect(shouldRedirectToKiosk("/login", true)).toBe(true);
  });

  it("redirects /signup back to the kiosk once kiosk mode is configured", () => {
    expect(shouldRedirectToKiosk("/signup", true)).toBe(true);
  });

  it("does not redirect when the device has no kiosk location configured", () => {
    expect(shouldRedirectToKiosk("/", false)).toBe(false);
    expect(shouldRedirectToKiosk("/login", false)).toBe(false);
    expect(shouldRedirectToKiosk("/signup", false)).toBe(false);
  });

  it("does not redirect routes outside the escape set, even on a configured kiosk device", () => {
    expect(shouldRedirectToKiosk("/kiosk", true)).toBe(false);
    expect(shouldRedirectToKiosk("/privacy", true)).toBe(false);
    expect(shouldRedirectToKiosk("/admin/location", true)).toBe(false);
    expect(shouldRedirectToKiosk("/dashboard", true)).toBe(false);
  });
});

describe("clearKioskDeviceState", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const key of KIOSK_DEVICE_STORAGE_KEYS) {
      localStorage.setItem(key, "some-value");
    }
    localStorage.setItem("kiosk_language", "es");
  });

  it("removes every kiosk device storage key", () => {
    clearKioskDeviceState();
    for (const key of KIOSK_DEVICE_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it("leaves unrelated localStorage keys untouched", () => {
    clearKioskDeviceState();
    expect(localStorage.getItem("kiosk_language")).toBe("es");
  });
});
