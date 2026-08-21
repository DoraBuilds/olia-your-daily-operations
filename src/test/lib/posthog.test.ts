import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), identify: vi.fn(), capture: vi.fn(), reset: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  getCookieConsent: vi.fn(),
}));

describe("posthog", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_POSTHOG_HOST", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("initPostHogIfConsented", () => {
    it("does not init when VITE_POSTHOG_KEY is unset", async () => {
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("does not init when consent was not accepted", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("declined");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("routes through the Supabase edge function proxy when VITE_SUPABASE_URL is set", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      vi.stubEnv("VITE_SUPABASE_URL", "https://myproj.supabase.co");
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test123",
        expect.objectContaining({ api_host: "https://myproj.supabase.co/functions/v1/posthog-proxy" }),
      );
    });

    it("falls back to VITE_POSTHOG_HOST when VITE_SUPABASE_URL is unset", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test123",
        expect.objectContaining({ api_host: "https://us.i.posthog.com" }),
      );
    });

    it("falls back to the EU host when neither VITE_SUPABASE_URL nor VITE_POSTHOG_HOST is set", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test123",
        expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
      );
    });

    it("only initialises once even if called twice", async () => {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      const posthog = (await import("posthog-js")).default;
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");

      const { initPostHogIfConsented } = await import("@/lib/posthog");
      initPostHogIfConsented();
      initPostHogIfConsented();
      expect(posthog.init).toHaveBeenCalledTimes(1);
    });
  });

  describe("when not initialized", () => {
    it("isPostHogReady returns false and identify/capture/reset no-op", async () => {
      const posthog = (await import("posthog-js")).default;
      const { isPostHogReady, identifyUser, captureEvent, resetPostHog } = await import("@/lib/posthog");

      expect(isPostHogReady()).toBe(false);
      identifyUser("user_1");
      captureEvent("some_event");
      resetPostHog();
      expect(posthog.identify).not.toHaveBeenCalled();
      expect(posthog.capture).not.toHaveBeenCalled();
      expect(posthog.reset).not.toHaveBeenCalled();
    });
  });

  describe("when initialized", () => {
    async function initAndConsent() {
      vi.stubEnv("VITE_POSTHOG_KEY", "phc_test123");
      const { getCookieConsent } = await import("@/lib/sentry");
      vi.mocked(getCookieConsent).mockReturnValue("accepted");
      const mod = await import("@/lib/posthog");
      mod.initPostHogIfConsented();
      return mod;
    }

    it("isPostHogReady returns true", async () => {
      const { isPostHogReady } = await initAndConsent();
      expect(isPostHogReady()).toBe(true);
    });

    it("identifyUser calls posthog.identify with traits", async () => {
      const posthog = (await import("posthog-js")).default;
      const { identifyUser } = await initAndConsent();
      identifyUser("user_1", { org_id: "org_1" });
      expect(posthog.identify).toHaveBeenCalledWith("user_1", { org_id: "org_1" });
    });

    it("captureEvent calls posthog.capture with properties", async () => {
      const posthog = (await import("posthog-js")).default;
      const { captureEvent } = await initAndConsent();
      captureEvent("checklist_created", { checklist_id: "abc" });
      expect(posthog.capture).toHaveBeenCalledWith("checklist_created", { checklist_id: "abc" });
    });

    it("resetPostHog calls posthog.reset", async () => {
      const posthog = (await import("posthog-js")).default;
      const { resetPostHog } = await initAndConsent();
      resetPostHog();
      expect(posthog.reset).toHaveBeenCalled();
    });
  });
});
