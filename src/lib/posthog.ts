import posthog from "posthog-js";
import { getCookieConsent } from "@/lib/sentry";

let initialized = false;

// Routes PostHog traffic through our own Supabase edge function instead of
// *.posthog.com directly — most ad-block lists (EasyList etc.) target the
// posthog.com domain specifically, so this alone recovers a meaningful slice
// of otherwise-dropped client events. See supabase/functions/posthog-proxy.
function resolveApiHost(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/posthog-proxy`;
  return import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";
}

export function initPostHogIfConsented(): void {
  if (initialized || !import.meta.env.VITE_POSTHOG_KEY) return;
  if (getCookieConsent() !== "accepted") return;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: resolveApiHost(),
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function isPostHogReady(): boolean {
  return initialized;
}

// Ties the current browser session to a known user. Call once per sign-in;
// safe to call again later to merge in newly-known traits (e.g. once the
// team_member row resolves after the initial auth event).
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(userId, traits);
}

// No-ops if the visitor never consented (or the token isn't configured) —
// callers do not need to check isPostHogReady() themselves.
export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

// Clears the identified user, so a subsequent sign-in on the same device
// (shared office computer, kiosk) doesn't attribute events to the previous
// account.
export function resetPostHog(): void {
  if (!initialized) return;
  posthog.reset();
}
