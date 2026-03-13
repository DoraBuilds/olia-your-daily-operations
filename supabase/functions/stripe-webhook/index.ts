// Supabase Edge Function — stripe-webhook
// Receives Stripe webhook events and updates the organizations table accordingly.
// Configure in Stripe Dashboard → Webhooks → Add endpoint → /functions/v1/stripe-webhook
//
// Events to enable in Stripe:
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed

import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map Stripe product/price metadata to Olia plan names.
// Set `olia_plan` in Stripe product metadata to "growth" or "enterprise".
// Fallback is "starter" (safe default — never accidentally assigns a paid tier).
function planFromMetadata(metadata: Record<string, string>): string {
  const plan = metadata?.olia_plan;
  if (plan === "growth" || plan === "enterprise") return plan;
  return "starter";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId =
          sub.metadata?.organization_id ??
          (await getOrgIdFromCustomer(stripe, String(sub.customer)));
        if (!orgId) break;

        const plan = planFromMetadata(sub.metadata ?? {});
        await supabase
          .from("organizations")
          .update({
            stripe_subscription_id: sub.id,
            plan,
            plan_status: sub.status,
          })
          .eq("id", orgId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId =
          sub.metadata?.organization_id ??
          (await getOrgIdFromCustomer(stripe, String(sub.customer)));
        if (!orgId) break;

        await supabase
          .from("organizations")
          .update({
            plan: "starter",
            plan_status: "canceled",
            stripe_subscription_id: null,
          })
          .eq("id", orgId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = await getOrgIdFromCustomer(stripe, String(invoice.customer));
        if (!orgId) break;

        await supabase
          .from("organizations")
          .update({ plan_status: "active" })
          .eq("id", orgId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = await getOrgIdFromCustomer(stripe, String(invoice.customer));
        if (!orgId) break;

        await supabase
          .from("organizations")
          .update({ plan_status: "past_due" })
          .eq("id", orgId);
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Handler error";
    console.error("Webhook handler error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

/** Looks up the organization_id from the Stripe customer metadata. */
async function getOrgIdFromCustomer(
  stripe: Stripe,
  customerId: string
): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as Stripe.Customer).metadata?.organization_id ?? null;
  } catch {
    return null;
  }
}
