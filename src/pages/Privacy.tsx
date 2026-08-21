import { Link } from "react-router-dom";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  useDocumentMeta(
    "Privacy Policy — Olia",
    "How Olia collects, uses, and protects your data under GDPR and Spain's LOPDGDD.",
  );
  return (
    <div className="min-h-screen bg-background legal-scope" style={legalTheme}>
      <style>{legalLinkStyle}</style>
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">

        {/* Back */}
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Olia
        </Link>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="font-display text-4xl text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: 21 July 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Olia ("we", "us", "our") operates oliahq.com and the Olia mobile app. This policy explains
          what personal data we collect, why we collect it, and your rights under the EU General Data
          Protection Regulation (GDPR / RGPD) and Spain's Ley Orgánica 3/2018 de Protección de Datos
          Personales y garantía de los derechos digitales (LOPDGDD).
        </p>

        <Section title="1. Who we are">
          <p>
            Olia is a hospitality operations platform. When your business signs up for Olia, your
            business is the data controller for your team's and staff's data. Olia acts as a data
            processor on your behalf.
          </p>
          <p>
            For questions about this policy, contact us at{" "}
            <a href="mailto:hello@oliahq.com" className="underline underline-offset-2 hover:text-foreground transition-colors">
              hello@oliahq.com
            </a>.
          </p>
        </Section>

        <Section title="2. What data we collect">
          <p><strong className="text-foreground">Account holders (owners):</strong> name, email address, business name.</p>
          <p><strong className="text-foreground">Managers:</strong> name, email address, hashed PIN.</p>
          <p><strong className="text-foreground">Staff profiles:</strong> name, role, hashed PIN. Staff profiles do not require an email address.</p>
          <p><strong className="text-foreground">Operational data:</strong> checklists, checklist completion logs, locations, infohub documents and training materials you create within Olia.</p>
          <p><strong className="text-foreground">Usage and error data:</strong> if you consent, we collect anonymised error and performance data via Sentry to help us fix bugs.</p>
          <p><strong className="text-foreground">Payment data:</strong> billing is handled by Stripe. We do not store card numbers — only your subscription status and Stripe customer ID.</p>
        </Section>

        <Section title="3. Why we collect it">
          <p>We process your data to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide and maintain the Olia service</li>
            <li>Send transactional emails (team invitations, alerts)</li>
            <li>Process subscription payments</li>
            <li>Improve reliability by monitoring errors (with your consent)</li>
          </ul>
          <p>
            Our legal basis is contract performance (Article 6(1)(b) GDPR) for service delivery,
            and legitimate interests (Article 6(1)(f)) for security and fraud prevention.
            Error monitoring relies on your consent (Article 6(1)(a)).
          </p>
        </Section>

        <Section title="4. Who we share data with">
          <p>We share data only with the processors listed below, all of which operate under GDPR-compliant data processing agreements:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Supabase</strong> — database and authentication, hosted in the EU (Ireland)</li>
            <li><strong className="text-foreground">Stripe</strong> — payment processing</li>
            <li><strong className="text-foreground">Resend</strong> — transactional email delivery</li>
            <li><strong className="text-foreground">Sentry</strong> — error monitoring, hosted in the EU (Frankfurt), only if you consent</li>
            <li><strong className="text-foreground">Google Maps</strong> — address lookup for location setup</li>
          </ul>
          <p>We do not sell your data to any third party.</p>
        </Section>

        <Section title="5. Data retention">
          <p>
            We keep your data for as long as your account is active. When you delete your account,
            all organisation data — including locations, team members, staff profiles, checklists,
            and logs — is permanently deleted within 30 days.
          </p>
          <p>
            You can delete your account at any time from the Admin → Account tab inside Olia.
          </p>
        </Section>

        <Section title="6. Your rights">
          <p>Under GDPR you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Access</strong> — request a copy of your personal data</li>
            <li><strong className="text-foreground">Correction</strong> — ask us to correct inaccurate data</li>
            <li><strong className="text-foreground">Deletion</strong> — delete your account and all associated data from within the app, or by emailing us</li>
            <li><strong className="text-foreground">Portability</strong> — request your data in a machine-readable format</li>
            <li><strong className="text-foreground">Objection</strong> — object to processing based on legitimate interests</li>
            <li><strong className="text-foreground">Withdraw consent</strong> — change your cookie preference at any time by clearing your browser data</li>
          </ul>
          <p>
            To exercise any right, email{" "}
            <a href="mailto:hello@oliahq.com" className="underline underline-offset-2 hover:text-foreground transition-colors">
              hello@oliahq.com
            </a>. We will respond within 30 days.
          </p>
          <p>
            You also have the right to lodge a complaint with Spain's data protection authority,
            the{" "}
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Agencia Española de Protección de Datos (AEPD)
            </a>, C/ Jorge Juan 6, 28001 Madrid.
          </p>
        </Section>

        <Section title="7. Cookies">
          <p>
            We use cookies in compliance with Article 22.2 of Spain's LSSI-CE and AEPD guidelines.
            A full list of every cookie we use is in our{" "}
            <Link to="/cookies" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Cookie Policy
            </Link>. In summary:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Essential:</strong> authentication session cookies set by Supabase. These are required
              for the app to function and do not require consent.
            </li>
            <li>
              <strong className="text-foreground">Analytics / monitoring:</strong> error tracking via Sentry. These are only active
              if you click "Accept all" on the cookie banner. Both options are given equal
              prominence — you can decline without affecting any core functionality.
            </li>
          </ul>
        </Section>

        <Section title="8. Data security">
          <p>
            All data is encrypted in transit (TLS) and at rest. PINs are stored as salted hashes
            and are never readable after creation. Access to the database is restricted to
            authenticated users within their own organisation via row-level security policies.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>
            We may update this policy from time to time. If we make material changes, we will notify
            you by email. The date at the top of this page shows when it was last updated.
          </p>
        </Section>

        {/* Footer */}
        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          <Link to="/aviso-legal" className="hover:text-foreground transition-colors">Aviso Legal</Link>
          <a href="mailto:hello@oliahq.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </div>
  );
}
