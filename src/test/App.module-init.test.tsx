import { describe, it, expect, vi } from "vitest";

// Regression (#972): App.tsx preloaded page chunks at module scope before the
// loaders were declared, so a returning user (saved session) hit
// "Cannot access 'load…' before initialization" and got a blank page.
describe("App module initialisation", () => {
  it("loads without throwing when a stored Supabase session exists", async () => {
    vi.resetModules();
    localStorage.setItem("sb-test-auth-token", "{}");
    localStorage.removeItem("kiosk_location_id");
    try {
      await expect(import("@/App")).resolves.toBeDefined();
    } finally {
      localStorage.removeItem("sb-test-auth-token");
    }
  });
});
