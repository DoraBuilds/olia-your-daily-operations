import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, AlertCircle, ExternalLink, Zap, MapPin, Building2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  type Plan,
} from "@/lib/plan-features";

// ─── Stripe Price IDs (Starter + Growth only — Enterprise is sales-led) ─────
const PRICE_IDS: Record<"starter" | "growth", { monthly: string; annual: string }> = {
  starter: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY ?? "",
    annual:  import.meta.env.VITE_STRIPE_PRICE_STARTER_ANNUAL  ?? "",
  },
  growth: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_GROWTH_MONTHLY ?? "",
    annual:  import.meta.env.VITE_STRIPE_PRICE_GROWTH_ANNUAL  ?? "",
  },
};

const ENTERPRISE_SALES_EMAIL = "enterprise@olia.com";

// ─── Plan descriptions — single line, operator-focused ───────────────────────
const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  starter:    "For single-location restaurants getting started with digital operations.",
  growth:     "For operators managing multiple venues and growing teams.",
  enterprise: "For larger hospitality groups with complex operational needs.",
};

// ─── Feature bullets shown on each card ──────────────────────────────────────
const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  starter: [
    "1 location",
    "Up to 15 staff profiles",
    "Up to 10 checklists",
    "Kiosk mode",
    "SOP & training hub",
    "PDF export",
  ],
  growth: [
    "Up to 10 locations",
    "Up to 200 staff profiles",
    "Unlimited checklists",
    "AI checklist builder",
    "Multi-location oversight",
    "Advanced reporting & charts",
    "CSV + PDF export",
    "File-to-checklist conversion",
  ],
  enterprise: [
    "Unlimited locations & staff",
    "Everything in Growth",
    "Dedicated account manager",
    "Custom onboarding & training",
    "SLA-backed support",
    "Custom integrations on request",
  ],
};

// ─── Location limit hint shown directly on each card ─────────────────────────
const PLAN_LOCATION_HINT: Record<Plan, string> = {
  starter:    "1 location included",
  growth:     "Up to 10 locations",
  enterprise: "Unlimited locations",
};

// ─── Example location count used in the pricing illustration ─────────────────
// Starter uses 1 (its only option); Growth uses 3 (a relatable multi-venue size)
const PLAN_EXAMPLE_LOCATIONS: Partial<Record<Plan, number>> = {
  starter: 1,
  growth:  3,
  // enterprise: omitted — custom pricing, no numeric example shown
};

// ─── Side-by-side comparison rows ────────────────────────────────────────────
const COMPARISON_ROWS: { label: string; starter: string; growth: string; enterprise: string }[] = [
  { label: "Locations",           starter: "1",         growth: "Up to 10",  enterprise: "Unlimited" },
  { label: "Staff profiles",      starter: "Up to 15",  growth: "Up to 200", enterprise: "Unlimited" },
  { label: "Checklists",          starter: "Up to 10",  growth: "Unlimited", enterprise: "Unlimited" },
  { label: "AI checklist builder",starter: "—",         growth: "✓",         enterprise: "✓" },
  { label: "Multi-location view", starter: "—",         growth: "✓",         enterprise: "✓" },
  { label: "Advanced reporting",  starter: "—",         growth: "✓",         enterprise: "✓" },
  { label: "Priority support",    starter: "—",         growth: "—",         enterprise: "✓" },
];

// ─── Plan icons ───────────────────────────────────────────────────────────────
const PLAN_ICONS: Record<Plan, React.ReactNode> = {
  starter:    <MapPin size={14} />,
  growth:     <Zap size={14} />,
  enterprise: <Building2 size={14} />,
};

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { plan, planStatus, hasStripeSubscription } = usePlan();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgraded = searchParams.get("upgraded") === "1";
  const canceled  = searchParams.get("canceled")  === "1";

  // ── Stripe checkout (unchanged logic) ──────────────────────────────────────
  const handleUpgrade = async (targetPlan: "starter" | "growth") => {
    const priceId = PRICE_IDS[targetPlan][billing];
    if (!priceId) {
      setError("Stripe Price ID is not configured yet. Please add it to .env.local and redeploy.");
      return;
    }
    setLoading(targetPlan);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId, returnUrl: window.location.href.split("?")[0] },
      });
      if (fnError)     throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url)   window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // ── CTA label logic ─────────────────────────────────────────────────────────
  const ctaLabel = (p: Plan): string => {
    if (p === "enterprise")                    return "Book a demo";
    if (p === plan && hasStripeSubscription)   return "Current plan";
    if (p === plan)                            return `Subscribe to ${PLAN_LABELS[p]}`;
    // Upgrading from lower → higher tier
    const tierOrder: Plan[] = ["starter", "growth", "enterprise"];
    const currentIdx = tierOrder.indexOf(plan);
    const targetIdx  = tierOrder.indexOf(p);
    if (targetIdx > currentIdx) return `Upgrade to ${PLAN_LABELS[p]}`;
    return `Switch to ${PLAN_LABELS[p]}`;
  };

  const plans: Plan[] = ["starter", "growth", "enterprise"];

  return (
    <Layout
      title="Billing"
      subtitle="Manage your plan"
      headerLeft={
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} className="text-muted-foreground" />
        </button>
      }
    >
      <section className="space-y-4 pb-6">

        {/* ── Post-checkout banners ────────────────────────────────────────── */}
        {upgraded && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-ok/30 bg-status-ok/5">
            <Check size={15} className="text-status-ok shrink-0" />
            <p className="text-sm text-status-ok font-medium">Your plan has been upgraded. Welcome aboard!</p>
          </div>
        )}
        {canceled && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-warn/30 bg-status-warn/5">
            <AlertCircle size={15} className="text-status-warn shrink-0" />
            <p className="text-sm text-status-warn">Checkout was canceled — no changes made.</p>
          </div>
        )}

        {/* ── Current plan status card ─────────────────────────────────────── */}
        <div className="card-surface p-4 space-y-3">
          <p className="section-label">Your current plan</p>

          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold text-foreground">{PLAN_LABELS[plan]}</p>
                <span className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium",
                  plan === "enterprise" ? "bg-lavender/15 text-lavender"
                  : plan === "growth"   ? "bg-sage/15 text-sage"
                  :                       "bg-muted text-muted-foreground"
                )}>
                  {PLAN_ICONS[plan]}
                  {PLAN_LABELS[plan]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {planStatus === "trialing" ? "Free trial active" : planStatus === "active" ? "Active" : planStatus}
              </p>
            </div>
          </div>

          {/* Location allowance */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
            <MapPin size={13} className="text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              {plan === "enterprise"
                ? "Unlimited locations included"
                : `${PLAN_FEATURES[plan].maxLocations === -1 ? "Unlimited" : PLAN_FEATURES[plan].maxLocations} location${PLAN_FEATURES[plan].maxLocations === 1 ? "" : "s"} included on ${PLAN_LABELS[plan]}`
              }
              {plan === "starter" && (
                <span className="ml-1 text-sage font-medium">
                  — Upgrade to Growth for up to 10
                </span>
              )}
            </p>
          </div>

          {/* Stripe portal link */}
          {hasStripeSubscription && (
            <button
              onClick={() => {
                const portalUrl = import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL;
                if (!portalUrl) { alert("Customer portal not configured."); return; }
                window.open(portalUrl, "_blank");
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={12} />
              Manage subscription on Stripe
            </button>
          )}
        </div>

        {/* ── Billing period toggle ────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2">
          {(["monthly", "annual"] as const).map(period => (
            <button
              key={period}
              onClick={() => setBilling(period)}
              className={cn(
                "text-xs px-4 py-2 rounded-full border font-medium transition-colors",
                billing === period
                  ? "bg-sage text-primary-foreground border-sage"
                  : "border-border text-muted-foreground hover:border-sage/40"
              )}
            >
              {period === "monthly" ? "Monthly" : "Annual"}
              {period === "annual" && (
                <span className="ml-1.5 text-[10px] font-normal opacity-80">Save ~20%</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2 text-status-error text-xs px-1">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        {plans.map((p, idx) => {
          const isCurrent  = p === plan;
          const price      = PLAN_PRICES[p];
          const priceVal   = billing === "monthly" ? price.monthly : price.annual;
          const isLoadingP = loading === p;
          const isEnterprise = p === "enterprise";
          // Highlight Growth when user is on Starter (most likely next step)
          const isRecommended = p === "growth" && plan === "starter";

          return (
            <div key={p}>
              {/* "Why upgrade" callout — between Starter and Growth for Starter users */}
              {idx === 1 && plan === "starter" && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-sage/5 border border-sage/20 mb-3">
                  <Zap size={14} className="text-sage mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Need more than one location?</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Growth lets you manage multiple venues and teams from one account.
                    </p>
                  </div>
                </div>
              )}

              {/* Card */}
              <div className={cn(
                "rounded-2xl border p-4 space-y-4",
                isEnterprise
                  ? "bg-sage text-primary-foreground border-sage"          // dark premium card
                  : "bg-card border-border",
                isCurrent && !isEnterprise && "ring-1 ring-sage/60",
                isRecommended && !isEnterprise && "ring-2 ring-sage",
              )}>

                {/* Badges row */}
                <div className="flex items-center gap-2">
                  {isCurrent && (
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      isEnterprise ? "bg-white/20 text-white" : "bg-sage/15 text-sage"
                    )}>
                      Current plan
                    </span>
                  )}
                  {isRecommended && !isCurrent && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sage text-primary-foreground">
                      Most popular
                    </span>
                  )}
                </div>

                {/* Plan name + price */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className={cn(
                      "font-semibold text-lg",
                      isEnterprise ? "text-white" : "text-foreground"
                    )}>
                      {PLAN_LABELS[p]}
                    </p>
                    <p className={cn(
                      "text-xs mt-0.5 leading-relaxed",
                      isEnterprise ? "text-white/70" : "text-muted-foreground"
                    )}>
                      {PLAN_DESCRIPTIONS[p]}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {isEnterprise ? (
                      <>
                        <p className="text-sm font-semibold text-white/90">Custom pricing</p>
                        <p className="text-[10px] text-white/50 mt-0.5">{PLAN_LOCATION_HINT.enterprise}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-foreground">
                          {price.currency}{priceVal}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          / location / {billing === "monthly" ? "month" : "year"}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {PLAN_LOCATION_HINT[p]}
                        </p>
                        {PLAN_EXAMPLE_LOCATIONS[p] != null && (() => {
                          const n    = PLAN_EXAMPLE_LOCATIONS[p]!;
                          const total = (priceVal * n).toLocaleString("en-IE");
                          const period = billing === "monthly" ? "month" : "year";
                          return (
                            <p className="text-[10px] text-muted-foreground/50 mt-1.5 italic">
                              e.g. {n} {n === 1 ? "location" : "locations"} = {price.currency}{total} / {period}
                            </p>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>

                {/* Feature list */}
                <ul className="space-y-1.5">
                  {PLAN_HIGHLIGHTS[p].map(feature => (
                    <li key={feature} className={cn(
                      "flex items-center gap-2 text-xs",
                      isEnterprise ? "text-white/80" : "text-muted-foreground"
                    )}>
                      <Check size={12} className={isEnterprise ? "text-white/60 shrink-0" : "text-status-ok shrink-0"} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Divider */}
                <div className={cn("border-t", isEnterprise ? "border-white/20" : "border-border")} />

                {/* CTA */}
                {isEnterprise ? (
                  isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-white/20 text-white">
                      Current plan
                    </div>
                  ) : (
                    <a
                      href={`mailto:${ENTERPRISE_SALES_EMAIL}`}
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-white text-sage hover:bg-white/90"
                    >
                      Book a demo
                    </a>
                  )
                ) : isCurrent && hasStripeSubscription ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                    Current plan
                  </div>
                ) : (
                  <button
                    disabled={isLoadingP}
                    onClick={() => handleUpgrade(p as "starter" | "growth")}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
                      isRecommended
                        ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                        : "bg-sage text-primary-foreground hover:bg-sage-deep"
                    )}
                  >
                    {isLoadingP && <Loader2 size={14} className="animate-spin" />}
                    {ctaLabel(p)}
                  </button>
                )}

                {/* Enterprise — tailored pricing note */}
                {isEnterprise && !isCurrent && (
                  <p className="text-[10px] text-white/50 text-center -mt-2">
                    Pricing tailored to your operation
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Plan comparison ──────────────────────────────────────────────── */}
        <div className="card-surface p-4 space-y-3">
          <p className="section-label">Plan comparison</p>
          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-4 gap-1 pb-2 border-b border-border">
              <div /> {/* feature label column */}
              {(["starter", "growth", "enterprise"] as Plan[]).map(colPlan => (
                <p key={colPlan} className={cn(
                  "text-[10px] font-semibold text-center py-1 rounded",
                  colPlan === plan
                    ? "text-sage bg-sage/[0.06]"
                    : "text-muted-foreground"
                )}>
                  {PLAN_LABELS[colPlan]}
                </p>
              ))}
            </div>
            {/* Rows */}
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={cn(
                  "grid grid-cols-4 gap-1 py-2",
                  i < COMPARISON_ROWS.length - 1 && "border-b border-border/50"
                )}
              >
                <p className="text-[11px] text-muted-foreground leading-tight">{row.label}</p>
                {([row.starter, row.growth, row.enterprise] as const).map((val, ci) => {
                  const colPlan = (["starter", "growth", "enterprise"] as Plan[])[ci];
                  const isCurrentCol = colPlan === plan;
                  return (
                    <p key={ci} className={cn(
                      "text-[11px] text-center rounded py-0.5",
                      isCurrentCol && "bg-sage/[0.06]",
                      val === "—"        ? "text-muted-foreground/40"
                      : val === "✓"      ? "text-status-ok font-medium"
                      : isCurrentCol     ? "text-foreground font-medium"
                      :                    "text-muted-foreground"
                    )}>
                      {val}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer microcopy ─────────────────────────────────────────────── */}
        <div className="space-y-1 px-1">
          <p className="text-xs text-muted-foreground text-center">
            Secure payments powered by Stripe. Upgrade or cancel anytime.
          </p>
        </div>

      </section>
    </Layout>
  );
}
