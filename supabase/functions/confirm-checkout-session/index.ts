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

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
const err = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

function planFromMetadata(metadata: Record<string, string> | null | undefined): "starter" | "growth" | "enterprise" {
  const plan = metadata?.olia_plan;
  if (plan === "growth" || plan === "enterprise") return plan;
  return "starter";
}

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

    const { sessionId } = await req.json() as { sessionId?: string };
    if (!sessionId) return err("Missing Stripe checkout session ID.");

    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (memberError || !member) return err("Team member not found");

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "line_items.data.price.product"],
    });

    if (session.mode !== "subscription") {
      return err("Stripe session is not a subscription checkout.");
    }
    if (session.status !== "complete") {
      return ok({ synced: false, status: session.status ?? "open" });
    }

    const organizationId =
      session.metadata?.organization_id ??
      (session.customer_details?.email === user.email ? member.organization_id : null) ??
      member.organization_id;

    if (organizationId !== member.organization_id) {
      return err("This checkout session does not belong to your organization.");
    }

    const subscription = session.subscription as Stripe.Subscription | null;
    const sessionPlan =
      planFromMetadata(subscription?.metadata) !== "starter"
        ? planFromMetadata(subscription?.metadata)
        : planFromMetadata(session.metadata);

    let plan = sessionPlan;
    if (plan === "starter") {
      const linePrice = session.line_items?.data?.[0]?.price;
      const product = linePrice?.product as Stripe.Product | undefined;
      const productPlan = planFromMetadata(product?.metadata);
      if (productPlan !== "starter") {
        plan = productPlan;
      }
    }

    await supabase
      .from("organizations")
      .update({
        plan,
        plan_status: subscription?.status ?? "active",
        stripe_subscription_id: subscription?.id ?? null,
      })
      .eq("id", organizationId);

    return ok({
      synced: true,
      plan,
      planStatus: subscription?.status ?? "active",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return err(message);
  }
});
