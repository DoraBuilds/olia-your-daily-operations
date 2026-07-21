import * as Sentry from "@sentry/react";

const CONSENT_KEY = "olia_cookie_consent";

let initialized = false;

export function initSentryIfConsented(): void {
  if (initialized || !import.meta.env.VITE_SENTRY_DSN) return;
  if (localStorage.getItem(CONSENT_KEY) !== "accepted") return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

export function getCookieConsent(): "accepted" | "declined" | null {
  const v = localStorage.getItem(CONSENT_KEY);
  if (v === "accepted" || v === "declined") return v;
  return null;
}

export function setCookieConsent(value: "accepted" | "declined"): void {
  localStorage.setItem(CONSENT_KEY, value);
}
