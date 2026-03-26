import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Capacitor native plugin setup ─────────────────────────────────────────────
// These imports are safe in a web browser — Capacitor's web fallbacks are no-ops.
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";

function restoreGitHubPagesRoute() {
  const searchParams = new URLSearchParams(window.location.search);
  const fallbackRoute = searchParams.get("p");
  if (!fallbackRoute) return;

  const basePath = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL;
  const normalizedRoute = fallbackRoute.startsWith("/") ? fallbackRoute : `/${fallbackRoute}`;

  window.history.replaceState(null, "", `${basePath}${normalizedRoute}`);
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

createRoot(document.getElementById("root")!).render(<App />);
