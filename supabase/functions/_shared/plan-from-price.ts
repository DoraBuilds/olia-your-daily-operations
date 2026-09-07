// Shared plan-tier resolution for the Stripe billing edge functions
// (create-checkout-session, confirm-checkout-session, stripe-webhook).
//
// Primary source: `olia_plan` stamped on the Stripe product's metadata.
// Fallback: match the specific price ID against the known Growth/Enterprise
// price IDs configured as edge function secrets.
//
// Why the fallback exists: on 2026-09-07 the sandbox Stripe account's
// Growth product had no metadata set, so every checkout silently resolved
// to "starter" — upgrades appeared to succeed in Stripe but never took
// effect in Olia. Both sources here come from Stripe's own object (the
// price/product actually paid for), never from client-supplied input, so
// the fallback doesn't reopen the entitlement-spoofing risk that metadata-
// based derivation was introduced to close.

export type OliaPlan = "starter" | "growth" | "enterprise";

function knownPriceIdPlanMap(): Record<string, OliaPlan> {
  const map: Record<string, OliaPlan> = {};
  const byPlan: Record<Exclude<OliaPlan, "starter">, (string | undefined)[]> = {
    growth: [
      Deno.env.get("STRIPE_PRICE_ID_GROWTH_MONTHLY"),
      Deno.env.get("STRIPE_PRICE_ID_GROWTH_ANNUAL"),
    ],
    enterprise: [
      Deno.env.get("STRIPE_PRICE_ID_ENTERPRISE_MONTHLY"),
      Deno.env.get("STRIPE_PRICE_ID_ENTERPRISE_ANNUAL"),
    ],
  };
  for (const [plan, ids] of Object.entries(byPlan) as [Exclude<OliaPlan, "starter">, (string | undefined)[]][]) {
    for (const id of ids) if (id) map[id] = plan;
  }
  return map;
}

/** Maps Stripe product metadata to an Olia plan name. Fallback is "starter"
 *  (safe default — never accidentally assigns a paid tier). */
export function planFromMetadata(metadata: Record<string, string> | null | undefined): OliaPlan {
  const plan = metadata?.olia_plan;
  if (plan === "growth" || plan === "enterprise") return plan;
  return "starter";
}

/**
 * Resolves the plan for a purchased price: product metadata first, then the
 * known price-ID map. Logs a warning when the fallback had to be used, so a
 * product missing its metadata shows up in function logs instead of just
 * silently downgrading the customer.
 */
export function planFromPriceMetadata(
  priceId: string | null | undefined,
  productMetadata: Record<string, string> | null | undefined,
  callerLabel: string,
): OliaPlan {
  const metadataPlan = planFromMetadata(productMetadata);
  if (metadataPlan !== "starter") return metadataPlan;

  if (priceId) {
    const fallbackPlan = knownPriceIdPlanMap()[priceId];
    if (fallbackPlan) {
      console.warn(
        `[${callerLabel}] Stripe product metadata missing olia_plan for price ${priceId} — ` +
        `used the price-ID fallback (${fallbackPlan}). Set metadata.olia_plan on the Stripe ` +
        `product to fix at the source and silence this warning.`
      );
      return fallbackPlan;
    }
  }

  return "starter";
}
