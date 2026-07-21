import { useState } from "react";
import { Link } from "react-router-dom";
import { getCookieConsent, setCookieConsent, initSentryIfConsented } from "@/lib/sentry";

export function CookieBanner() {
  const [visible, setVisible] = useState(() => getCookieConsent() === null);

  if (!visible) return null;

  const accept = () => {
    setCookieConsent("accepted");
    initSentryIfConsented();
    setVisible(false);
  };

  const decline = () => {
    setCookieConsent("declined");
    setVisible(false);
  };

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
            to="/privacy"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors"
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
