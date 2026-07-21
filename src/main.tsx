import * as Sentry from "@sentry/react";
import { initSentryIfConsented } from "@/lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Capacitor native plugin setup ─────────────────────────────────────────────
// These imports are safe in a web browser — Capacitor's web fallbacks are no-ops.
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";
import { restoreGitHubPagesRoute as restoreGitHubPagesRoutePath } from "@/lib/github-pages-routing";

// ── Sentry error monitoring ───────────────────────────────────────────────────
// Only initialises when VITE_SENTRY_DSN is set AND the user has accepted cookies.
initSentryIfConsented();

function restoreGitHubPagesRoute() {
  const targetRoute = restoreGitHubPagesRoutePath(
    window.location.search,
    import.meta.env.BASE_URL,
    window.location.hash,
  );
  if (targetRoute) {
    window.history.replaceState(null, "", targetRoute);
  }
}

restoreGitHubPagesRoute();

if (Capacitor.isNativePlatform()) {
  // Status bar: light background (alabaster) with dark icons
  StatusBar.setStyle({ style: Style.Light });
  StatusBar.setBackgroundColor({ color: "#FDFAF7" });

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
