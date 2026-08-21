import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCookieConsent, setCookieConsent, initSentryIfConsented } from "@/lib/sentry";
import { initPostHogIfConsented } from "@/lib/posthog";
import { legalTheme, legalLinkStyle, isNewDesignPath } from "@/lib/legal-theme";

export function CookieBanner() {
  const [visible, setVisible] = useState(() => getCookieConsent() === null);
  const location = useLocation();
  const isNewDesign = isNewDesignPath(location.pathname);

  if (!visible) return null;

  const accept = () => {
    setCookieConsent("accepted");
    initSentryIfConsented();
    initPostHogIfConsented();
    setVisible(false);
  };

  const decline = () => {
    setCookieConsent("declined");
    setVisible(false);
  };

  if (!isNewDesign) {
    return (
      <div
        role="dialog"
        aria-label="Cookie consent"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg"
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-sm text-muted-foreground flex-1">
            We use essential cookies to run the app, and optional cookies for error
            monitoring. See our{" "}
            <Link
              to="/cookies"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Cookie Policy
            </Link>{" "}
            for details.
          </p>
          <div className="flex gap-2 shrink-0">
            {/* Equal visual weight required by AEPD — no dark patterns */}
            <button
              onClick={decline}
              className="px-4 py-2 text-sm font-medium bg-muted text-foreground rounded-xl hover:opacity-80 transition-opacity"
            >
              Essential only
            </button>
            <button
              onClick={accept}
              className="px-4 py-2 text-sm font-medium bg-sage text-white rounded-xl hover:opacity-90 transition-opacity"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 border-t legal-scope"
      style={{ ...legalTheme, borderColor: "hsl(var(--border))", background: "#fff", boxShadow: "0 -8px 30px rgba(11,15,12,0.08)" }}
    >
      <style>{legalLinkStyle}</style>
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm flex-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          We use essential cookies to run the app, and optional cookies for error
          monitoring. See our{" "}
          <Link to="/cookies">Cookie Policy</Link> for details.
        </p>
        <div className="flex gap-2 shrink-0">
          {/* Equal visual weight required by AEPD — no dark patterns */}
          <button
            onClick={decline}
            className="px-4 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
            style={{ background: "#F1F3F1", color: "hsl(var(--foreground))" }}
          >
            Essential only
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm font-medium rounded-full text-white transition-opacity hover:opacity-90"
            style={{ background: "#0B0F0C" }}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
