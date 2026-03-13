import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanProps {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  isExternal?: boolean;
}

const PLANS: PlanProps[] = [
  {
    name: "Starter",
    price: "€49",
    period: "/ location / month",
    tagline: "For single-site restaurants and cafés getting started.",
    features: [
      "Up to 5 checklists",
      "Compliance & temperature logging",
      "Issue reporting",
      "Kiosk access — unlimited staff",
      "30-day data history",
      "Email support",
    ],
    cta: "Start with Starter",
    ctaHref: "/signup",
  },
  {
    name: "Growth",
    price: "€99",
    period: "/ location / month",
    tagline: "For teams that want the full system — and the reporting to match.",
    features: [
      "Unlimited checklists",
      "Full compliance suite",
      "SOP & training hub",
      "Analytics & reporting",
      "Multi-location dashboard (up to 10 sites)",
      "12-month data history",
      "Priority support",
    ],
    cta: "Start with Growth",
    ctaHref: "/signup",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "For groups with 10+ locations or custom requirements.",
    features: [
      "Everything in Growth",
      "Unlimited locations",
      "Dedicated onboarding",
      "Custom integrations",
      "SLA & account management",
      "Invoiced billing",
    ],
    cta: "Contact sales",
    ctaHref: "mailto:sales@useolia.com?subject=Enterprise enquiry",
    isExternal: true,
  },
];

function PricingCard({ plan }: { plan: PlanProps }) {
  const { name, price, period, tagline, features, cta, ctaHref, highlight, isExternal } = plan;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl p-6 sm:p-8 border transition-shadow",
        highlight
          ? "border-sage shadow-lg"
          : "border-border bg-card shadow-sm"
      )}
      style={highlight ? { background: "hsl(var(--card))" } : {}}
    >
      {/* Most popular badge */}
      {highlight && (
        <div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: "hsl(var(--sage))" }}
        >
          Most popular
        </div>
      )}

      {/* Plan name */}
      <p className="font-semibold text-base text-foreground mb-1">{name}</p>

      {/* Price */}
      <div className="flex items-end gap-1 mb-2">
        <span className="font-display text-4xl text-foreground leading-none">{price}</span>
        {period && (
          <span className="text-sm text-muted-foreground mb-1 leading-tight">{period}</span>
        )}
      </div>

      {/* Tagline */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{tagline}</p>

      {/* CTA */}
      {isExternal ? (
        <a
          href={ctaHref}
          className={cn(
            "w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl border border-border transition-colors mb-6",
            "hover:bg-background text-foreground"
          )}
        >
          {cta}
          <ArrowRight size={14} />
        </a>
      ) : (
        <Link
          to={ctaHref}
          className={cn(
            "w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl transition-opacity mb-6",
            highlight
              ? "bg-sage text-white hover:opacity-90"
              : "bg-sage text-white hover:opacity-90"
          )}
        >
          {cta}
          <ArrowRight size={14} />
        </Link>
      )}

      {/* Divider */}
      <div className="border-t border-border mb-5" />

      {/* Features */}
      <ul className="space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              size={15}
              className="shrink-0 mt-0.5"
              style={{ color: "hsl(var(--status-ok))" }}
            />
            <span className="text-sm text-muted-foreground leading-snug">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-background py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-14">
          <p className="section-label mb-3">Pricing</p>
          <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-3">
            Simple pricing per location.
          </h2>
          <p className="text-muted-foreground text-base">
            No per-user fees. Unlimited staff. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-5 items-start">
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        {/* Fine print */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </div>
    </section>
  );
}
