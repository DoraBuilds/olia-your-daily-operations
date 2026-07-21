import { Link } from "react-router-dom";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function CookieRow({
  name, provider, purpose, type, duration,
}: {
  name: string; provider: string; purpose: string; type: string; duration: string;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 font-mono text-xs text-foreground align-top">{name}</td>
      <td className="py-3 pr-4 text-xs align-top">{provider}</td>
      <td className="py-3 pr-4 text-xs align-top">{purpose}</td>
      <td className="py-3 pr-4 text-xs align-top">{type}</td>
      <td className="py-3 text-xs align-top">{duration}</td>
    </tr>
  );
}

export default function Cookies() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">

        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Olia
        </Link>

        <div className="space-y-2">
          <h1 className="font-display text-4xl text-foreground">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: 21 July 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          This policy explains what cookies and similar technologies Olia uses, why, and how you
          can control them. It applies to oliahq.com and the Olia app. It complies with Article
          22.2 of Spain's LSSI-CE and the AEPD's cookie guidance.
        </p>

        <Section title="What are cookies?">
          <p>
            Cookies are small text files stored on your device when you visit a website. They help
            the site remember information between pages or visits. Some are essential for the site
            to work; others are optional and require your consent.
          </p>
        </Section>

        <Section title="Essential cookies">
          <p>
            These cookies are necessary for Olia to function. They are set automatically when you
            use the app and cannot be disabled without breaking core features. No consent is
            required for essential cookies under LSSI Article 22.2.
          </p>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Cookie</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Provider</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Purpose</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Type</th>
                  <th className="pb-2 text-xs font-semibold text-foreground">Duration</th>
                </tr>
              </thead>
              <tbody>
                <CookieRow
                  name="sb-*-auth-token"
                  provider="Supabase"
                  purpose="Keeps you signed in to your Olia account across page loads"
                  type="Essential"
                  duration="Session / 1 year"
                />
                <CookieRow
                  name="olia_cookie_consent"
                  provider="Olia (localStorage)"
                  purpose="Remembers your cookie preference so the banner is not shown again"
                  type="Essential"
                  duration="1 year"
                />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Analytics and monitoring cookies">
          <p>
            These cookies are optional. They are only active if you click <strong className="text-foreground">Accept all</strong>{" "}
            on the cookie banner. Declining does not affect any core Olia functionality.
          </p>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Cookie</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Provider</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Purpose</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Type</th>
                  <th className="pb-2 text-xs font-semibold text-foreground">Duration</th>
                </tr>
              </thead>
              <tbody>
                <CookieRow
                  name="sentry-sc (session storage)"
                  provider="Sentry"
                  purpose="Tracks error sessions to help us diagnose bugs and crashes"
                  type="Analytics"
                  duration="Session"
                />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Third-party cookies (in-app only)">
          <p>
            The following third-party service is loaded only when you use a specific feature
            inside the signed-in app. It is not active on the public landing page.
          </p>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Cookie</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Provider</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Purpose</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-foreground">Type</th>
                  <th className="pb-2 text-xs font-semibold text-foreground">Duration</th>
                </tr>
              </thead>
              <tbody>
                <CookieRow
                  name="CONSENT, _GRECAPTCHA"
                  provider="Google Maps"
                  purpose="Address autocomplete when setting up a location in Admin"
                  type="Functional"
                  duration="6 months"
                />
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            Google Maps is loaded only on the Admin → My Location screen. It is not loaded on
            the landing page and does not track visitors. Google's privacy policy applies to
            data processed by Google Maps.
          </p>
        </Section>

        <Section title="How to change your preference">
          <p>
            You can change your cookie preference at any time by clearing your browser's local
            storage for oliahq.com. The cookie banner will reappear on your next visit.
          </p>
          <p>
            In most browsers: Settings → Privacy → Cookies / Site data → find oliahq.com → Clear.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For questions about our use of cookies, email{" "}
            <a href="mailto:hello@oliahq.com" className="underline underline-offset-2 hover:text-foreground transition-colors">
              hello@oliahq.com
            </a>{" "}
            or write to us at the address in our{" "}
            <Link to="/aviso-legal" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Aviso Legal
            </Link>.
          </p>
          <p>
            You may also file a complaint with Spain's data protection authority, the{" "}
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              AEPD
            </a>.
          </p>
        </Section>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/aviso-legal" className="hover:text-foreground transition-colors">Aviso Legal</Link>
        </div>
      </div>
    </div>
  );
}
