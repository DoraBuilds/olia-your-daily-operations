import { Link } from "react-router-dom";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Terms() {
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
          <h1 className="font-display text-4xl text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: 21 July 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          These Terms of Service ("Terms") govern your use of Olia, operated by Olia ("we", "us",
          "our"). By creating an account you agree to these Terms.
        </p>

        <Section title="1. The service">
          <p>
            Olia is a hospitality operations platform that helps teams manage checklists, staff
            schedules, and daily operations. We provide the platform on a subscription basis.
          </p>
        </Section>

        <Section title="2. Your account">
          <p>
            You must provide accurate information when creating an account. You are responsible for
            keeping your login credentials secure and for all activity that occurs under your account.
          </p>
          <p>
            One account represents one organisation. You may add multiple locations and team members
            within your subscription limits.
          </p>
        </Section>

        <Section title="3. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use Olia for any unlawful purpose</li>
            <li>Attempt to gain unauthorised access to any part of the service or another organisation's data</li>
            <li>Upload content that is harmful, defamatory, or infringes third-party rights</li>
            <li>Resell or sublicense access to Olia without our written consent</li>
            <li>Reverse engineer or attempt to extract the source code of the service</li>
          </ul>
        </Section>

        <Section title="4. Subscription and payment">
          <p>
            Olia is offered on monthly and annual subscription plans. Prices are shown on the
            billing page. All prices exclude VAT where applicable.
          </p>
          <p>
            Subscriptions renew automatically at the end of each billing period. You can cancel at
            any time from Admin → Account → Billing. Cancellation takes effect at the end of the
            current paid period — you will not be charged again, and you retain access until that
            date.
          </p>
          <p>
            We do not offer refunds for partial periods except where required by law.
          </p>
        </Section>

        <Section title="5. Free trial">
          <p>
            New accounts receive a free trial period as shown at signup. No payment method is
            required during the trial. At the end of the trial you must subscribe to continue
            using the service.
          </p>
        </Section>

        <Section title="6. Your data">
          <p>
            You own your data. We process it only to provide the service and as described in our{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            You can export your checklist data at any time from within the app. On account deletion,
            all your data is permanently removed from our systems.
          </p>
        </Section>

        <Section title="7. Availability">
          <p>
            We aim for high availability but do not guarantee uninterrupted access. We may perform
            maintenance that temporarily affects the service. We will notify you of planned downtime
            where reasonably possible.
          </p>
        </Section>

        <Section title="8. Intellectual property">
          <p>
            Olia and its underlying software, design, and content are owned by us and protected by
            intellectual property law. These Terms do not grant you any rights to our intellectual
            property beyond what is necessary to use the service.
          </p>
          <p>
            Content you create within Olia (checklists, documents, training materials) remains
            yours.
          </p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Olia is not liable for indirect, incidental,
            special, or consequential damages arising from your use of the service, including loss
            of profits or data.
          </p>
          <p>
            Our total liability to you for any claim arising under these Terms is limited to the
            amount you paid us in the three months before the claim arose.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            Either party may terminate at any time. We may suspend or terminate your account if you
            breach these Terms, with or without notice depending on the severity of the breach.
          </p>
          <p>
            On termination, your right to access the service ceases immediately. We will retain
            your data for 30 days before permanent deletion, during which time you may contact us
            to request an export.
          </p>
        </Section>

        <Section title="11. Changes to these Terms">
          <p>
            We may update these Terms from time to time. We will notify you by email at least 14
            days before material changes take effect. Continued use of Olia after that date
            constitutes acceptance of the new Terms.
          </p>
        </Section>

        <Section title="12. Governing law">
          <p>
            These Terms are governed by Spanish law. Any disputes arising from or relating to these
            Terms or the use of the service will be subject to the exclusive jurisdiction of the
            courts of Barcelona, Spain, unless mandatory consumer protection law in your country
            grants you the right to bring proceedings in your local courts.
          </p>
        </Section>

        <Section title="13. VAT / IVA">
          <p>
            Prices shown do not include VAT (IVA in Spain). For customers based in Spain, IVA at
            the applicable rate (currently 21%) will be added to invoices. EU business customers
            outside Spain may be subject to the reverse charge mechanism.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            For any questions about these Terms, email us at{" "}
            <a href="mailto:hello@oliahq.com" className="underline underline-offset-2 hover:text-foreground transition-colors">
              hello@oliahq.com
            </a>.
          </p>
        </Section>

        {/* Footer */}
        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          <Link to="/aviso-legal" className="hover:text-foreground transition-colors">Aviso Legal</Link>
          <a href="mailto:hello@oliahq.com" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </div>
    </div>
  );
}
