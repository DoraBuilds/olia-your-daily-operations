import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Loader2, AlertCircle, ExternalLink, Zap, MapPin, Building2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/hooks/usePlan";
import { useAuth } from "@/contexts/AuthContext";
import { runtimeConfig } from "@/lib/runtime-config";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
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

function useComparisonRows(t: (key: string) => string): ComparisonRow[] {
  const v = (key: string) => t(`comparison.values.${key}`);
  const row = (key: string) => t(`comparison.rows.${key}`);
  const section = (key: string) => t(`comparison.sections.${key}`);
  return [
    // ── Usage limits ──────────────────────────────────────────────────────────
    { isHeader: true, label: section("usageLimits") },
    { label: row("locations"),      starter: v("one"),    growth: v("upTo10"),  enterprise: v("unlimited") },
    { label: row("staffProfiles"),  starter: v("upTo15"), growth: v("upTo200"), enterprise: v("unlimited") },
    { label: row("checklists"),     starter: v("upTo10"), growth: v("unlimited"), enterprise: v("unlimited") },
    // ── Core features ─────────────────────────────────────────────────────────
    { isHeader: true, label: section("coreFeatures") },
    { label: row("kioskMode"),         starter: "✓", growth: "✓", enterprise: "✓" },
    { label: row("staffPinCheckin"),   starter: "✓", growth: "✓", enterprise: "✓" },
    { label: row("checklistBuilder"),  starter: "✓", growth: "✓", enterprise: "✓" },
    { label: row("sopTrainingHub"),    starter: "✓", growth: "✓", enterprise: "✓" },
    { label: row("pdfExport"),         starter: "✓", growth: "✓", enterprise: "✓" },
    // ── Growth features ───────────────────────────────────────────────────────
    { isHeader: true, label: section("growthFeatures") },
    { label: row("multiLocationView"),      starter: "—", growth: "✓", enterprise: "✓" },
    { label: row("aiChecklistBuilder"),     starter: "—", growth: "✓", enterprise: "✓" },
    { label: row("fileToChecklistImport"),  starter: "—", growth: "✓", enterprise: "✓" },
    { label: row("advancedReporting"),      starter: "—", growth: "✓", enterprise: "✓" },
    { label: row("csvExport"),              starter: "—", growth: "✓", enterprise: "✓" },
    // ── Enterprise features ───────────────────────────────────────────────────
    { isHeader: true, label: section("enterprise") },
    { label: row("dedicatedAccountManager"), starter: "—", growth: "—", enterprise: "✓" },
    { label: row("customOnboarding"),        starter: "—", growth: "—", enterprise: "✓" },
    { label: row("slaBackedSupport"),        starter: "—", growth: "—", enterprise: "✓" },
    { label: row("customIntegrations"),      starter: "—", growth: "—", enterprise: "✓" },
  ];
}

// ─── Plan icons ───────────────────────────────────────────────────────────────
const PLAN_ICONS: Record<Plan, React.ReactNode> = {
  starter:    <MapPin size={14} />,
  growth:     <Zap size={14} />,
  enterprise: <Building2 size={14} />,
};

export default function Billing() {
  const { t } = useTranslation("billing");
  const COMPARISON_ROWS = useComparisonRows(t);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { teamMember } = useAuth();
  const qc = useQueryClient();
  const { plan, resolvedPlan, planStatus, hasStripeSubscription, billingUnavailable } = usePlan();
  const isNative = useIsNativeApp();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const upgraded = searchParams.get("upgraded") === "1";
  const canceled  = searchParams.get("canceled")  === "1";
  const checkoutSessionId = searchParams.get("session_id");

  // Keep a live ref to resolvedPlan so the async polling loop can read the
  // latest value without being stale-closure-bound to the initial render.
  const resolvedPlanRef = useRef(resolvedPlan);
  useEffect(() => { resolvedPlanRef.current = resolvedPlan; }, [resolvedPlan]);

  // Always start at the top — navigating here from Admin's "Manage Billing" CTA
  // can land mid-page otherwise.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Confirm the completed Stripe checkout session directly so the page does
  // not stay stuck waiting only on the webhook write.
  //
  // Strategy:
  //  1. Call confirm-checkout-session (up to 3 attempts at 0s / 3s / 9s).
  //     If it returns { synced: true }, the DB is already updated — invalidate
  //     and we're done.
  //  2. If the edge function is unavailable or the session isn't complete yet,
  //     fall through to a polling phase (every 3s for up to ~30s) that keeps
  //     invalidating the org query and watches for resolvedPlan to change.
  //     This catches webhook-driven updates that arrive after the function calls.
  //  3. Only after the full polling window expires without a plan change do we
  //     surface the actionable error banner.
  useEffect(() => {
    if (!upgraded || !teamMember?.organization_id) return;
    const key = ["organization", teamMember.organization_id];
    let cancelled = false;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const invalidateOrg = () => qc.invalidateQueries({ queryKey: key });

    const syncPlan = async () => {
      setActivationError(null);

      // ── Phase 1: proactive confirm via edge function ──────────────────────
      // Attempt to write the plan directly from the checkout session.
      // fnError or a non-synced response both fall through to Phase 2.
      if (checkoutSessionId) {
        const attemptDelays = [0, 3000, 9000];
        for (const delay of attemptDelays) {
          if (delay > 0) await sleep(delay);
          if (cancelled) return;

          invalidateOrg();

          const { data, error: fnError } = await supabase.functions.invoke("confirm-checkout-session", {
            body: { sessionId: checkoutSessionId },
          });

          if (cancelled) return;

          // Application-level error (e.g. session belongs to a different org):
          // surface immediately — no point retrying.
          if (data?.error) {
            throw new Error(data.error);
          }

          // Infrastructure error (function not deployed, network down):
          // log and fall through to polling phase instead of surfacing to user.
          if (fnError) {
            console.warn("[Billing] confirm-checkout-session unavailable, falling back to plan polling:", fnError.message);
            break;
          }

          if (data?.synced) {
            invalidateOrg();
            return;
          }
          // data?.synced === false: DB write not complete yet — continue loop
        }
      } else {
        // No session_id — Stripe sent us back without one.
        // Invalidate once so an already-complete webhook write is picked up.
        invalidateOrg();
      }

      if (cancelled) return;

      // ── Phase 2: webhook-fallback polling ─────────────────────────────────
      // The edge function either wasn't available or the session wasn't
      // confirmed yet. Poll the org query every 3s for up to ~30s waiting for
      // the Stripe webhook to write the plan update to the DB.
      const POLL_INTERVAL_MS = 3000;
      const POLL_TIMEOUT_MS  = 30000;
      const pollStart = Date.now();

      while (!cancelled && Date.now() - pollStart < POLL_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);
        if (cancelled) return;

        invalidateOrg();

        // Give React Query a tick to process the invalidation refetch before
        // checking the ref — the query updates synchronously after the fetch.
        await sleep(500);
        if (cancelled) return;

        if (resolvedPlanRef.current && resolvedPlanRef.current !== "starter") {
          // Plan was updated by the webhook — banner will flip to success.
          return;
        }
      }

      if (!cancelled) {
        setActivationError(t("banners.activationTimeout"));
      }
    };

    void syncPlan().catch((err: unknown) => {
      if (cancelled) return;
      setActivationError(
        err instanceof Error
          ? err.message
          : t("banners.activationTimeoutGeneric"),
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
      setError(t("errors.notConfigured"));
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
      if (fnError) throw new Error(fnError.message ?? t("errors.couldNotReachService"));

      // Application-level errors are in data.error (Stripe not configured, etc.)
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(t("errors.noCheckoutUrl"));
      }
    } catch (e: any) {
      const raw: string = e?.message ?? t("errors.genericError");
      // Stripe not configured → friendly contact-us message
      if (raw.includes("Stripe is not configured") || raw.includes("STRIPE_SECRET_KEY")) {
        setError(t("errors.stripeNotConfigured"));
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
    if (targetIdx > currentIdx) return t("card.upgradeTo", { plan: PLAN_LABELS[p] });
    return t("card.switchTo", { plan: PLAN_LABELS[p] });
  };

  const plans: Plan[] = ["starter", "growth", "enterprise"];
  const currentPlanSummary = billingUnavailable
    ? t("planSummary.couldNotVerify")
    : t("planSummary.planActive", { plan: PLAN_LABELS[plan], trial: planStatus === "trialing" ? t("planSummary.onTrial") : "" });
  const currentPlanMaxLocations = PLAN_FEATURES[resolvedPlan ?? plan].maxLocations;
  const currentPlanAllowance = billingUnavailable
    ? t("planSummary.refreshMoment")
    : plan === "enterprise"
      ? t("planSummary.unlimitedLocationsIncluded")
      : currentPlanMaxLocations === -1
        ? t("planSummary.unlimitedLocationsIncluded")
        : t("planSummary.locationsIncluded", { count: currentPlanMaxLocations });

  if (isNative) {
    return (
      <Layout
        title="Olia"
        subtitle={t("subtitle")}
        headerLeft={
          <button
            onClick={() => navigate("/admin")}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            aria-label={t("back")}
          >
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
        }
      >
        <section className="space-y-4 pb-6">
          <div className="card-surface p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">{t("native.currentPlan")}</p>
            <p className="text-xl font-display font-semibold text-foreground capitalize">{plan}</p>
            <p className="text-sm text-muted-foreground">
              {t("native.viewOnWebNotice")}
            </p>
            <a
              href="https://olia.app/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sage underline underline-offset-2"
            >
              {t("native.manageAtOlia")} <ExternalLink size={13} />
            </a>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout
      title="Olia"
      subtitle={t("subtitle")}
      headerLeft={
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label={t("back")}
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
                {t("banners.welcomeAboard", { plan: PLAN_LABELS[plan] })}
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
                {t("banners.activating")}
              </p>
            </div>
          )
        )}
        {canceled && (
          <div className="card-surface px-4 py-3 flex items-center gap-2 border border-status-warn/30 bg-status-warn/5">
            <AlertCircle size={15} className="text-status-warn shrink-0" />
            <p className="text-sm text-status-warn">{t("banners.canceled")}</p>
          </div>
        )}

        {/* ── Current plan summary ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                billingUnavailable ? "bg-muted text-muted-foreground"
                : plan === "enterprise" ? "bg-lavender/15 text-lavender"
                : plan === "growth"   ? "bg-sage/15 text-sage"
                :                       "bg-muted text-muted-foreground"
              )}>
                {billingUnavailable ? <AlertCircle size={14} /> : PLAN_ICONS[plan]}
                {billingUnavailable ? t("planSummary.billingUnavailableBadge") : PLAN_LABELS[plan]}
              </span>
              <p className="text-sm font-medium text-foreground">
                {currentPlanSummary}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {currentPlanAllowance}
              {!billingUnavailable && plan === "starter" && (
                <span className="ml-1 text-sage font-medium">
                  {t("planSummary.upgradeHint")}
                </span>
              )}
            </p>
          </div>

          {hasStripeSubscription && (
            <button
              onClick={() => {
                const portalUrl = runtimeConfig.stripe.customerPortalUrl;
                if (!portalUrl) { alert(t("planSummary.customerPortalNotConfigured")); return; }
                window.open(portalUrl, "_blank");
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ExternalLink size={12} />
              {t("planSummary.manageSubscription")}
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
              {period === "monthly" ? t("period.monthly") : t("period.annual")}
              {period === "annual" && (
                <span className="ml-1.5 text-xs font-normal opacity-80">{t("period.saveApprox")}</span>
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
                      "text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-border bg-card text-sage"
                    )}>
                      {t("card.currentPlan")}
                    </span>
                  )}
                  {isRecommended && !isCurrent && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sage text-primary-foreground shadow-sm border border-sage">
                      {t("card.recommended")}
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
                      {t(`plans.${p}.description`)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 min-h-[4.75rem] flex flex-col items-end">
                    {isEnterprise ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">{t("card.customPricing")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("plans.enterprise.locationHint")}</p>
                        <div className="mt-auto h-[2.25rem]" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <p className="text-[1.75rem] font-bold leading-none text-foreground">
                          {price.currency}{priceVal}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("card.perLocationPer", { period: billing === "monthly" ? t("period.month") : t("period.year") })}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {t(`plans.${p}.locationHint`)}
                        </p>
                        {PLAN_EXAMPLE_LOCATIONS[p] != null && (() => {
                          const n    = PLAN_EXAMPLE_LOCATIONS[p]!;
                          const total = (priceVal * n).toLocaleString("en-IE");
                          const period = billing === "monthly" ? t("period.month") : t("period.year");
                          return (
                            <p className="text-xs text-muted-foreground/50 mt-1.5 italic">
                              {t("card.exampleLocations", { count: n, locationWord: t("card.location", { count: n }), currency: price.currency, total, period })}
                            </p>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>

                {/* Feature list */}
                <ul className="space-y-1.5">
                  {(t(`plans.${p}.highlights`, { returnObjects: true }) as string[]).map(feature => (
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
                  <p className="text-xs text-muted-foreground/70 text-center">
                    {t("card.pricingTailored")}
                  </p>
                )}
                {isEnterprise ? (
                  isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                      {t("card.currentPlan")}
                    </div>
                  ) : (
                    <a
                      href={`mailto:${ENTERPRISE_SALES_EMAIL}`}
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-sage text-primary-foreground hover:bg-sage-deep"
                    >
                      {t("card.bookADemo")}
                    </a>
                  )
                ) : isCurrent ? (
                  // Always show "Current plan" as a non-clickable label for the active plan,
                  // regardless of whether there's a Stripe subscription (Starter is free).
                  <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-muted text-muted-foreground">
                    {t("card.currentPlan")}
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
          <p className="section-label">{t("comparison.heading")}</p>
          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-4 gap-1 pb-2 border-b border-border">
              <div /> {/* feature label column */}
              {(["starter", "growth", "enterprise"] as Plan[]).map(colPlan => (
                <p key={colPlan} className={cn(
                  "text-xs font-semibold text-center py-1 rounded",
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
                    <p className="col-span-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
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
            {t("footer")}
          </p>
        </div>

      </section>
    </Layout>
  );
}
