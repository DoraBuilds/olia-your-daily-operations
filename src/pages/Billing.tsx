import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Layout } from "@/components/Layout";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  limitLabel,
  type Plan,
} from "@/lib/plan-features";

// ─── Stripe Price IDs (Starter + Growth only — Enterprise is sales-led) ─────
const PRICE_IDS: Record<"starter" | "growth", { monthly: string; annual: string }> = {
  starter: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_STARTER_MONTHLY ?? "",
    annual: import.meta.env.VITE_STRIPE_PRICE_STARTER_ANNUAL ?? "",
  },
  growth: {
    monthly: import.meta.env.VITE_STRIPE_PRICE_GROWTH_MONTHLY ?? "",
    annual: import.meta.env.VITE_STRIPE_PRICE_GROWTH_ANNUAL ?? "",
  },
};

const ENTERPRISE_SALES_EMAIL = "enterprise@olia.com";

const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  starter: "For individual operators managing a single location.",
  growth: "For growing teams with multiple locations and AI-powered tools.",
  enterprise: "For large operations needing custom scale, SLAs, and dedicated support. Pricing is tailored to your needs.",
};

// Human-readable feature list shown on each plan card
const PLAN_HIGHLIGHTS: Record<Plan, string[]> = {
  starter: [
    `${limitLabel(PLAN_FEATURES.starter.maxLocations)} location`,
    `Up to ${limitLabel(PLAN_FEATURES.starter.maxStaff)} staff`,
    `Up to ${limitLabel(PLAN_FEATURES.starter.maxChecklists)} checklists`,
    "PDF export",
    "Basic reporting",
  ],
  growth: [
    `Up to ${limitLabel(PLAN_FEATURES.growth.maxLocations)} locations`,
    `Up to ${limitLabel(PLAN_FEATURES.growth.maxStaff)} staff`,
    "Unlimited checklists",
    "AI checklist builder",
    "File conversion",
    "Advanced reporting + charts",
    "CSV + PDF export",
  ],
  enterprise: [
    "Unlimited locations",
    "Unlimited staff",
    "Unlimited checklists",
    "Everything in Growth",
    "Priority support",
    "Custom onboarding",
  ],
};

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { plan, planStatus, org, hasStripeSubscription } = usePlan();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgraded = searchParams.get("upgraded") === "1";
  const canceled = searchParams.get("canceled") === "1";

  const handleUpgrade = async (targetPlan: "starter" | "growth") => {
    const priceId = PRICE_IDS[targetPlan][billing];
    if (!priceId) {
      setError(
        "Stripe Price ID is not configured yet. Please add it to .env.local and redeploy."
      );
      return;
    }
    setLoading(targetPlan);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            priceId,
            returnUrl: window.location.href.split("?")[0],
          },
        }
      );
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
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
      <section className="space-y-4">

        {/* Success/cancel banners */}
        {upgraded && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-ok/30 bg-status-ok/5">
            <Check size={15} className="text-status-ok shrink-0" />
            <p className="text-sm text-status-ok font-medium">
              Your plan has been upgraded. Welcome aboard!
            </p>
          </div>
        )}
        {canceled && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-warn/30 bg-status-warn/5">
            <AlertCircle size={15} className="text-status-warn shrink-0" />
            <p className="text-sm text-status-warn">Checkout was canceled — no changes made.</p>
          </div>
        )}

        {/* Current plan */}
        <div className="card-surface p-4">
          <p className="section-label mb-2">Current plan</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-foreground">{PLAN_LABELS[plan]}</p>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {planStatus === "trialing" ? "Free trial" : planStatus}
              </p>
            </div>
            <span
              className={cn(
                "text-xs px-3 py-1 rounded-full font-medium",
                plan === "enterprise"
                  ? "bg-lavender/15 text-lavender"
                  : plan === "growth"
                  ? "bg-sage/15 text-sage"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {PLAN_LABELS[plan]}
            </span>
          </div>
          {hasStripeSubscription && (
            <button
              onClick={() => {
                const portalUrl = import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL;
                if (!portalUrl) {
                  alert("Customer portal not configured.");
                  return;
                }
                window.open(portalUrl, "_blank");
              }}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={12} />
              Manage subscription on Stripe
            </button>
          )}
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setBilling("monthly")}
            className={cn(
              "text-xs px-4 py-2 rounded-full border font-medium transition-colors",
              billing === "monthly"
                ? "bg-sage text-primary-foreground border-sage"
                : "border-border text-muted-foreground hover:border-sage/40"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={cn(
              "text-xs px-4 py-2 rounded-full border font-medium transition-colors",
              billing === "annual"
                ? "bg-sage text-primary-foreground border-sage"
                : "border-border text-muted-foreground hover:border-sage/40"
            )}
          >
            Annual
            <span className="ml-1.5 text-[10px] font-normal opacity-80">Save ~20%</span>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 text-status-error text-xs px-1">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Plan cards */}
        {plans.map(p => {
          const isCurrent = p === plan;
          const price = PLAN_PRICES[p];
          const priceVal = billing === "monthly" ? price.monthly : price.annual;
          const isLoading = loading === p;

          return (
            <div
              key={p}
              className={cn(
                "card-surface p-4 space-y-4",
                isCurrent && "ring-1 ring-sage/60"
              )}
            >
              {/* Plan header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{PLAN_LABELS[p]}</p>
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sage/15 text-sage font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{PLAN_DESCRIPTIONS[p]}</p>
                </div>
                <div className="text-right shrink-0">
                  {p === "enterprise" ? (
                    <p className="text-sm font-semibold text-lavender">Custom pricing</p>
                  ) : priceVal === 0 ? (
                    <p className="text-lg font-bold text-foreground">Free</p>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-foreground">
                        {price.currency}{priceVal}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        / location / {billing === "monthly" ? "mo" : "yr"}
                      </p>
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

              {/* CTA */}
              {p === "enterprise" ? (
                isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                    Current plan
                  </div>
                ) : (
                  <a
                    href={`mailto:${ENTERPRISE_SALES_EMAIL}`}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-lavender/15 text-lavender hover:bg-lavender/25 border border-lavender/30"
                  >
                    Contact Sales
                  </a>
                )
              ) : isCurrent && hasStripeSubscription ? (
                <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                  Current plan
                </div>
              ) : (
                <button
                  disabled={isLoading}
                  onClick={() => handleUpgrade(p as "starter" | "growth")}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-sage text-primary-foreground hover:bg-sage-deep"
                >
                  {isLoading && <Loader2 size={14} className="animate-spin" />}
                  {isCurrent ? `Subscribe to ${PLAN_LABELS[p]}` : `Upgrade to ${PLAN_LABELS[p]}`}
                </button>
              )}
            </div>
          );
        })}

        {/* Note */}
        <p className="text-xs text-muted-foreground text-center px-4">
          All payments are processed securely by Stripe. Cancel anytime.
          Prices are in {PLAN_PRICES.growth.currency} per location per month and may vary by region.
        </p>
      </section>
    </Layout>
  );
}
