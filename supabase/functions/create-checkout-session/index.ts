// Supabase Edge Function — create-checkout-session
// Creates a Stripe Checkout session so a user can upgrade their plan.
// Called by Billing.tsx → supabase.functions.invoke("create-checkout-session", { body: ... })

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

// Helper: always return HTTP 200 with { error } so supabase-js routes the
// response to `data` (not `fnError`). This avoids relying on
// FunctionsHttpError.context body-parsing, which silently fails in some
// versions of @supabase/functions-js because the response body may already
// be consumed before the error reaches the caller.
const ok  = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
const err = (message: string) =>
  new Response(JSON.stringify({ error: message }), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Guard: fail fast with a clear, readable message if Stripe is not configured.
    // Returned as HTTP 200 so supabase-js puts it in `data.error`, not `fnError`.
    if (!STRIPE_SECRET_KEY) {
      return err("Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase Edge Function secrets.");
    }

    // Verify the user's JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Not authenticated");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the calling user's ID from the JWT
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return err("Invalid session");

    // Look up the team member's org
    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (memberError || !member) return err("Team member not found");

    // Look up the org to get/create the Stripe customer
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", member.organization_id)
      .single();
    if (orgError || !org) return err("Organization not found");

    const { priceId, planName, returnUrl } = await req.json() as {
      priceId: string;
      planName: string;   // e.g. "growth" — used to stamp olia_plan on the subscription
      returnUrl: string;
    };

    const stripe = new Stripe(STRIPE_SECRET_KEY!, {
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

    // Create the Stripe Checkout session.
    // subscription_data.metadata carries both:
    //   organization_id — so the webhook can find the right org row
    //   olia_plan       — so the webhook knows which plan tier to write
    // Without olia_plan here, planFromMetadata() falls back to "starter"
    // and the webhook would silently downgrade the org after a successful checkout.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${returnUrl}?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${returnUrl}?canceled=1`,
      subscription_data: {
        metadata: {
          organization_id: org.id,
          olia_plan: planName ?? "growth",
        },
      },
    });

    return ok({ url: session.url });

  } catch (e: unknown) {
    // Unexpected crash — still return 200 so the message reaches the frontend.
    const message = e instanceof Error ? e.message : "Internal error";
    return err(message);
  }
});
