import posthog from "posthog-js";
import { getCookieConsent } from "@/lib/sentry";

let initialized = false;

export function initPostHogIfConsented(): void {
  if (initialized || !import.meta.env.VITE_POSTHOG_KEY) return;
  if (getCookieConsent() !== "accepted") return;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
    person_profiles: "identified_only",
  });
  initialized = true;
}
