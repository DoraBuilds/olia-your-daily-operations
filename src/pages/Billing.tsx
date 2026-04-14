import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, AlertCircle, ExternalLink, Zap, MapPin, Building2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import { useAuth } from "@/contexts/AuthContext";
import { runtimeConfig } from "@/lib/runtime-config";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  type Plan,
} from "@/lib/plan-features";

// ─── Stripe Price IDs (Starter + Growth only — Enterprise is sales-led) ─────
const PRICE_IDS: Record<"starter" | "growth", { monthly: string; annual: string }> = {
  starter: runtimeConfig.stripe.priceIds.starter,
  growth: runtimeConfig.stripe.priceIds.growth,
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
// Section headers use a special `isHeader: true` flag to render as dividers.
type ComparisonRow =
  | { isHeader: true; label: string }
  | { isHeader?: false; label: string; starter: string; growth: string; enterprise: string };

const COMPARISON_ROWS: ComparisonRow[] = [
  // ── Usage limits ──────────────────────────────────────────────────────────
  { isHeader: true, label: "Usage limits" },
  { label: "Locations",      starter: "1",         growth: "Up to 10",  enterprise: "Unlimited" },
  { label: "Staff profiles", starter: "Up to 15",  growth: "Up to 200", enterprise: "Unlimited" },
  { label: "Checklists",     starter: "Up to 10",  growth: "Unlimited", enterprise: "Unlimited" },
  // ── Core features ─────────────────────────────────────────────────────────
  { isHeader: true, label: "Core features" },
  { label: "Kiosk mode",          starter: "✓", growth: "✓", enterprise: "✓" },
  { label: "Staff PIN check-in",  starter: "✓", growth: "✓", enterprise: "✓" },
  { label: "Checklist builder",   starter: "✓", growth: "✓", enterprise: "✓" },
  { label: "SOP & training hub",  starter: "✓", growth: "✓", enterprise: "✓" },
  { label: "PDF export",          starter: "✓", growth: "✓", enterprise: "✓" },
  // ── Growth features ───────────────────────────────────────────────────────
  { isHeader: true, label: "Growth features" },
  { label: "Multi-location view",      starter: "—", growth: "✓", enterprise: "✓" },
  { label: "AI checklist builder",     starter: "—", growth: "✓", enterprise: "✓" },
  { label: "File-to-checklist import", starter: "—", growth: "✓", enterprise: "✓" },
  { label: "Advanced reporting",       starter: "—", growth: "✓", enterprise: "✓" },
  { label: "CSV export",               starter: "—", growth: "✓", enterprise: "✓" },
  // ── Enterprise features ───────────────────────────────────────────────────
  { isHeader: true, label: "Enterprise" },
  { label: "Dedicated account manager", starter: "—", growth: "—", enterprise: "✓" },
  { label: "Custom onboarding",         starter: "—", growth: "—", enterprise: "✓" },
  { label: "SLA-backed support",        starter: "—", growth: "—", enterprise: "✓" },
  { label: "Custom integrations",       starter: "—", growth: "—", enterprise: "✓" },
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
  const { teamMember } = useAuth();
  const qc = useQueryClient();
  const { plan, resolvedPlan, planStatus, hasStripeSubscription, billingUnavailable } = usePlan();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const upgraded = searchParams.get("upgraded") === "1";
  const canceled  = searchParams.get("canceled")  === "1";
  const checkoutSessionId = searchParams.get("session_id");

  // Always start at the top — navigating here from Admin's "Manage Billing" CTA
  // can land mid-page otherwise.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Confirm the completed Stripe checkout session directly so the page does
  // not stay stuck waiting only on the webhook write.
  useEffect(() => {
    if (!upgraded || !teamMember?.organization_id) return;
    const key = ["organization", teamMember.organization_id];
    let cancelled = false;

    const syncPlan = async () => {
      const invalidateOrg = () => qc.invalidateQueries({ queryKey: key });
      const attemptDelays = [0, 3000, 9000];
      setActivationError(null);

      for (const delay of attemptDelays) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (cancelled) return;

        invalidateOrg();

        if (!checkoutSessionId) continue;

        const { data, error: fnError } = await supabase.functions.invoke("confirm-checkout-session", {
          body: { sessionId: checkoutSessionId },
        });

        if (cancelled) return;
        if (fnError) {
          throw new Error(fnError.message ?? "We couldn't confirm the Stripe checkout session yet.");
        }
        if (data?.error) {
          throw new Error(data.error);
        }
        if (data?.synced) {
          invalidateOrg();
          return;
        }
      }

      if (!cancelled) {
        setActivationError("Checkout completed, but we couldn't confirm the plan change yet. Please refresh in a moment or contact us if it stays stuck.");
      }
    };

    void syncPlan().catch((err: unknown) => {
      if (cancelled) return;
      setActivationError(
        err instanceof Error
          ? err.message
          : "Checkout completed, but we couldn't confirm the plan change yet.",
      );
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgraded, checkoutSessionId, teamMember?.organization_id]);

  // ── Stripe checkout (unchanged logic) ──────────────────────────────────────
  const handleUpgrade = async (targetPlan: "starter" | "growth") => {
    const priceId = PRICE_IDS[targetPlan][billing];
    if (!priceId) {
      setError("Online upgrades are not configured for this deployment yet. Please contact us so we can complete billing setup.");
      return;
    }
    setLoading(targetPlan);
    setError(null);
    try {
      // The edge function always returns HTTP 200 (even for application-level
      // errors), so supabase-js always routes the response to `data`, never to
      // `fnError`. This avoids the unreliable FunctionsHttpError.context body-
      // parsing that previously caused the generic "non-2xx" message to leak.
      const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId, planName: targetPlan, returnUrl: window.location.href.split("?")[0] },
      });

      // fnError only fires for genuine infrastructure failures (network down,
      // function not deployed, CORS crash). Surface those directly.
      if (fnError) throw new Error(fnError.message ?? "Could not reach the upgrade service.");

      // Application-level errors are in data.error (Stripe not configured, etc.)
      if (data?.error) throw new Error(data.error);
      if (data?.url)   window.location.href = data.url;
    } catch (e: any) {
      const raw: string = e?.message ?? "Something went wrong. Please try again.";
      // Stripe not configured → friendly contact-us message
      if (raw.includes("Stripe is not configured") || raw.includes("STRIPE_SECRET_KEY")) {
        setError("Online upgrades aren't available yet. To upgrade your plan, email us at hello@olia.app and we'll get you set up.");
      } else {
        setError(raw);
      }
    } finally {
      setLoading(null);
    }
  };

  // ── CTA label logic ─────────────────────────────────────────────────────────
  // Only used for non-current, non-enterprise plans (the "else" branch in the JSX).
  const ctaLabel = (p: Plan): string => {
    const tierOrder: Plan[] = ["starter", "growth", "enterprise"];
    const currentIdx = tierOrder.indexOf(plan);
    const targetIdx  = tierOrder.indexOf(p);
    if (targetIdx > currentIdx) return `Upgrade to ${PLAN_LABELS[p]}`;
    return `Switch to ${PLAN_LABELS[p]}`;
  };

  const plans: Plan[] = ["starter", "growth", "enterprise"];
  const currentPlanSummary = billingUnavailable
    ? "We couldn't verify your billing plan just now."
    : `${PLAN_LABELS[plan]} is active${planStatus === "trialing" ? " on trial" : ""}.`;
  const currentPlanAllowance = billingUnavailable
    ? "Refresh in a moment and we’ll pull the latest billing state."
    : plan === "enterprise"
      ? "Unlimited locations included."
      : `${PLAN_FEATURES[resolvedPlan ?? plan].maxLocations === -1 ? "Unlimited" : PLAN_FEATURES[resolvedPlan ?? plan].maxLocations} location${PLAN_FEATURES[resolvedPlan ?? plan].maxLocations === 1 ? "" : "s"} included.`;

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
          // Show one of three states:
          // 1. Plan is confirmed in DB (webhook already processed) → green success
          // 2. Plan not yet updated (sync still in flight) → neutral "activating"
          // 3. Checkout succeeded but sync could not be confirmed → actionable error
          plan !== "starter" ? (
            <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-ok/30 bg-status-ok/5">
              <Check size={15} className="text-status-ok shrink-0" />
              <p className="text-sm text-status-ok font-medium">
                You're now on {PLAN_LABELS[plan]}. Welcome aboard!
              </p>
            </div>
          ) : activationError ? (
            <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-error/30 bg-status-error/5">
              <AlertCircle size={15} className="text-status-error shrink-0" />
              <p className="text-sm text-status-error">
                {activationError}
              </p>
            </div>
          ) : (
            <div className="card-surface px-4 py-3 flex items-center gap-2 border border-border bg-muted/40">
              <Loader2 size={15} className="text-muted-foreground shrink-0 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Checkout complete — activating your plan. This page will update automatically.
              </p>
            </div>
          )
        )}
        {canceled && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-warn/30 bg-status-warn/5">
            <AlertCircle size={15} className="text-status-warn shrink-0" />
            <p className="text-sm text-status-warn">Checkout was canceled — no changes made.</p>
          </div>
        )}

        {/* ── Current plan summary ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium",
                billingUnavailable ? "bg-muted text-muted-foreground"
                : plan === "enterprise" ? "bg-lavender/15 text-lavender"
                : plan === "growth"   ? "bg-sage/15 text-sage"
                :                       "bg-muted text-muted-foreground"
              )}>
                {billingUnavailable ? <AlertCircle size={14} /> : PLAN_ICONS[plan]}
                {billingUnavailable ? "Billing unavailable" : PLAN_LABELS[plan]}
              </span>
              <p className="text-sm font-medium text-foreground">
                {currentPlanSummary}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {currentPlanAllowance}
              {!billingUnavailable && plan === "starter" && (
                <span className="ml-1 text-sage font-medium">
                  Upgrade to Growth for up to 10 locations.
                </span>
              )}
            </p>
          </div>

          {hasStripeSubscription && (
            <button
              onClick={() => {
                const portalUrl = runtimeConfig.stripe.customerPortalUrl;
                if (!portalUrl) { alert("Customer portal not configured."); return; }
                window.open(portalUrl, "_blank");
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
          <div className={cn(
            "flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl",
            error.includes("@")
              ? "bg-muted/60 text-foreground border border-border"
              : "bg-status-error/10 text-status-error border border-status-error/20",
          )}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        <div className="pt-5 pb-3">
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-3 lg:items-stretch xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
        {plans.map((p) => {
          const isCurrent  = p === plan;
          const price      = PLAN_PRICES[p];
          const priceVal   = billing === "monthly" ? price.monthly : price.annual;
          const isLoadingP = loading === p;
          const isEnterprise = p === "enterprise";
          const isRecommended = p === "growth";

          return (
            <div
              key={p}
              className={cn(
                "h-full",
                isRecommended && "lg:scale-[1.02] lg:z-10",
              )}
            >
              <div className={cn(
                "relative rounded-3xl border bg-card border-border px-4 pb-4 pt-7 space-y-4 h-full flex flex-col",
                isCurrent && "ring-1 ring-sage/60",
                isRecommended && "ring-2 ring-sage shadow-[0_18px_48px_rgba(91,125,97,0.12)]",
              )}>

                {/* Badges row */}
                <div className="absolute left-1/2 top-0 z-10 flex min-h-5 -translate-x-1/2 -translate-y-[62%] items-center justify-center gap-2">
                  {isCurrent && (
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium shadow-sm border border-border bg-card text-sage"
                    )}>
                      Current plan
                    </span>
                  )}
                  {isRecommended && !isCurrent && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sage text-primary-foreground shadow-sm border border-sage">
                      Recommended
                    </span>
                  )}
                </div>

                {/* Plan name + price */}
                <div className="flex min-h-[7.75rem] items-start justify-between gap-4">
                  <div className="max-w-[15rem]">
                    <p className="font-semibold text-lg text-foreground">
                      {PLAN_LABELS[p]}
                    </p>
                    <p className="text-xs mt-0.5 leading-relaxed text-muted-foreground">
                      {PLAN_DESCRIPTIONS[p]}
                    </p>
                  </div>
                  <div className="text-right shrink-0 min-h-[4.75rem] flex flex-col items-end">
                    {isEnterprise ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">Custom pricing</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{PLAN_LOCATION_HINT.enterprise}</p>
                        <div className="mt-auto h-[2.25rem]" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <p className="text-[1.75rem] font-bold leading-none text-foreground">
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
                    <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check size={12} className="text-status-ok shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Divider */}
                <div className="border-t border-border mt-auto" />

                {/* CTA */}
                <div className="space-y-3">
                {isEnterprise && !isCurrent && (
                  <p className="text-[10px] text-muted-foreground/70 text-center">
                    Pricing tailored to your operation
                  </p>
                )}
                {isEnterprise ? (
                  isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                      Current plan
                    </div>
                  ) : (
                    <a
                      href={`mailto:${ENTERPRISE_SALES_EMAIL}`}
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-sage text-primary-foreground hover:bg-sage-deep"
                    >
                      Book a demo
                    </a>
                  )
                ) : isCurrent ? (
                  // Always show "Current plan" as a non-clickable label for the active plan,
                  // regardless of whether there's a Stripe subscription (Starter is free).
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                    Current plan
                  </div>
                ) : (
                  <button
                    disabled={isLoadingP}
                    onClick={() => handleUpgrade(p as "starter" | "growth")}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-sage text-primary-foreground hover:bg-sage-deep"
                  >
                    {isLoadingP && <Loader2 size={14} className="animate-spin" />}
                    {ctaLabel(p)}
                  </button>
                )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
        </div>

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
            {COMPARISON_ROWS.map((row, i) => {
              if (row.isHeader) {
                return (
                  <div key={`header-${row.label}`} className="grid grid-cols-4 gap-1 pt-3 pb-1">
                    <p className="col-span-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {row.label}
                    </p>
                  </div>
                );
              }
              const dataRow = row as { label: string; starter: string; growth: string; enterprise: string };
              const isLast = i === COMPARISON_ROWS.length - 1 || COMPARISON_ROWS[i + 1]?.isHeader;
              return (
                <div
                  key={dataRow.label}
                  className={cn(
                    "grid grid-cols-4 gap-1 py-2",
                    !isLast && "border-b border-border/50"
                  )}
                >
                  <p className="text-[11px] text-muted-foreground leading-tight">{dataRow.label}</p>
                  {([dataRow.starter, dataRow.growth, dataRow.enterprise] as const).map((val, ci) => {
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
              );
            })}
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
