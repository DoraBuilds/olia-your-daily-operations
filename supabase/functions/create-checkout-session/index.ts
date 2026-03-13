// Supabase Edge Function — create-checkout-session
// Creates a Stripe Checkout session so a user can upgrade their plan.
// Called by Billing.tsx → supabase.functions.invoke("create-checkout-session", { body: ... })

import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Verify the user's JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the calling user's ID from the JWT
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) throw new Error("Invalid session");

    // Look up the team member's org
    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (memberError || !member) throw new Error("Team member not found");

    // Look up the org to get/create the Stripe customer
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", member.organization_id)
      .single();
    if (orgError || !org) throw new Error("Organization not found");

    const { priceId, returnUrl } = await req.json() as {
      priceId: string;
      returnUrl: string;
    };

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Reuse existing Stripe customer or create a new one
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: user.email,
        metadata: { organization_id: org.id },
      });
      customerId = customer.id;
      // Save the customer ID back to the org
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id);
    }

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${returnUrl}?upgraded=1`,
      cancel_url: `${returnUrl}?canceled=1`,
      subscription_data: {
        metadata: { organization_id: org.id },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
