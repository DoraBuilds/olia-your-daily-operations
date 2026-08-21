import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  getCookieConsent: vi.fn(),
}));

describe("initPostHogIfConsented", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_POSTHOG_HOST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("inits with the configured key and host when consented", async () => {
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

  it("falls back to the EU host when VITE_POSTHOG_HOST is unset", async () => {
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
