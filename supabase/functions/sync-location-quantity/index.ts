// Supabase Edge Function — sync-location-quantity
// Growth is billed per location (€99/location/month) with no cap on how many
// a customer can add — but the Stripe subscription's line-item quantity has
// to be kept in sync with the org's actual location count, or the customer
// is simply charged the base single-location price forever regardless of how
// many locations they add. Called after any location add/delete, and as a
// self-healing check whenever the Billing page loads.
//
// Only ever adjusts a Growth org's subscription — Starter is capped at 1
// location (quantity never needs to change) and Enterprise is a custom,
// non-Stripe-self-serve contract.

import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Always HTTP 200 with { error } so supabase-js routes to `data`, not
// `fnError` — matches the pattern in create-checkout-session /
// confirm-checkout-session. This function is also called fire-and-forget
// from the client, so callers should treat any `error` as non-fatal.
const ok  = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
const err = (message: string) =>
  new Response(JSON.stringify({ error: message }), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return err("Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase Edge Function secrets.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Not authenticated");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return err("Invalid session");

    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (memberError || !member) return err("Team member not found");

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, plan, stripe_subscription_id")
      .eq("id", member.organization_id)
      .single();
    if (orgError || !org) return err("Organization not found");

    // Only Growth is billed per location. Starter is capped at 1 (quantity
    // never needs to move) and Enterprise isn't a self-serve Stripe
    // subscription, so there's nothing to sync for either.
    if (org.plan !== "growth" || !org.stripe_subscription_id) {
      return ok({ synced: false, reason: "not applicable" });
    }

    const { count: locationCount, error: countError } = await supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    if (countError) return err(countError.message);

    // A subscription can't have a quantity of 0 — floor at 1 (an org mid-way
    // through deleting its last location before adding a replacement).
    const targetQuantity = Math.max(1, locationCount ?? 1);

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const item = subscription.items.data[0];
    if (!item) return err("Subscription has no line items.");

    if (item.quantity === targetQuantity) {
      return ok({ synced: false, reason: "already in sync", quantity: targetQuantity });
    }

    // create_prorations (Stripe's default): adds a prorated adjustment to the
    // next invoice rather than charging immediately, so an add/delete never
    // triggers a surprise mid-cycle charge.
    await stripe.subscriptionItems.update(item.id, {
      quantity: targetQuantity,
      proration_behavior: "create_prorations",
    });

    return ok({ synced: true, quantity: targetQuantity });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return err(message);
  }
});
