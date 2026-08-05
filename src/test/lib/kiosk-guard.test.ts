import { describe, it, expect } from "vitest";
import { shouldRedirectToKiosk } from "@/lib/kiosk-guard";

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
