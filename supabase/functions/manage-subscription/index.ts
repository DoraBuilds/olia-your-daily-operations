// Supabase Edge Function — manage-subscription
//
// Lets an owner pause (stop auto-renewal) or resume their Stripe
// subscription from the Billing page, without leaving Olia. "Pause" sets
// cancel_at_period_end so they keep paid access through the period they
// already paid for, then drop to Starter automatically — the existing
// stripe-webhook customer.subscription.deleted / updated handlers already
// reconcile organizations.plan/plan_status once Stripe fires that event,
// so this function only ever talks to Stripe, never writes billing columns
// itself.
//
// POST body: { action: "pause" | "resume" }
// Called from: src/pages/Billing.tsx

import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = corsHeaders(req.headers.get("origin"));

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  const err = (reason: string) =>
    new Response(JSON.stringify({ success: false, reason }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return err("Method not allowed");

  if (!STRIPE_SECRET_KEY) {
    return err("Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase Edge Function secrets.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Not authenticated");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return err("Invalid session");

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }
  if (body.action !== "pause" && body.action !== "resume") {
    return err("action must be \"pause\" or \"resume\"");
  }

  const { data: member, error: memberError } = await supabase
    .from("team_members")
    .select("organization_id, is_owner")
    .eq("id", user.id)
    .single();
  if (memberError || !member) return err("Team member not found");
  if (!member.is_owner) return err("Only the account owner can manage the subscription");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("stripe_subscription_id")
    .eq("id", member.organization_id)
    .single();
  if (orgError || !org?.stripe_subscription_id) return err("No active subscription to manage");

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const subscription = await stripe.subscriptions.update(org.stripe_subscription_id, {
      cancel_at_period_end: body.action === "pause",
    });
    return ok({
      success: true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : "Could not update the subscription with Stripe.");
  }
});
