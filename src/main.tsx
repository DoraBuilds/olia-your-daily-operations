import * as Sentry from "@sentry/react";
import { initSentryIfConsented } from "@/lib/sentry";
import { initPostHogIfConsented } from "@/lib/posthog";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Capacitor native plugin setup ─────────────────────────────────────────────
// These imports are safe in a web browser — Capacitor's web fallbacks are no-ops.
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";

// ── Sentry error monitoring ───────────────────────────────────────────────────
// Only initialises when VITE_SENTRY_DSN is set AND the user has accepted cookies.
initSentryIfConsented();

// ── PostHog analytics ──────────────────────────────────────────────────────
// Only initialises when VITE_POSTHOG_KEY is set AND the user has accepted cookies.
initPostHogIfConsented();

// GitHub Pages deep-link restoration now happens in App.tsx, before the
// router is created (see comment there) — importing App below already runs it.

if (Capacitor.isNativePlatform()) {
  // Status bar: white background with dark icons
  StatusBar.setStyle({ style: Style.Light });
  StatusBar.setBackgroundColor({ color: "#FFFFFF" });

  // Hide splash screen after app is ready
  SplashScreen.hide({ fadeOutDuration: 300 });

  // Keyboard: scroll body up so focused inputs stay visible
  Keyboard.setAccessoryBarVisible({ isVisible: false });
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<p style={{ padding: "2rem", fontFamily: "sans-serif" }}>Something went wrong. Please refresh the page.</p>}>
    <App />
  </Sentry.ErrorBoundary>,
);
