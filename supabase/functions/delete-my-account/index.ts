// Supabase Edge Function — delete-my-account
//
// Replaces a direct `supabase.rpc("delete_my_account")` call from the
// client. The RPC alone can only touch Postgres — it can't reach the
// Stripe API — so an owner deleting their account while on a paid plan
// kept getting billed forever (Stripe never heard about the deletion).
// This function:
//   1. Verifies the caller and confirms they're the org owner.
//   2. Best-effort cancels their Stripe subscription immediately, if any.
//      stripe-webhook's existing customer.subscription.deleted handler
//      reconciles plan/plan_status once Stripe confirms the cancellation —
//      this function does not touch those columns itself.
//   3. Calls delete_my_account() (20260918000003), which marks the org for
//      the 30-day purge window and deletes the owner's auth identity.
//
// Called from: src/pages/admin/AccountTab.tsx (deleteAccount)

import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";
import { captureServerEvent } from "../_shared/posthog.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Not authenticated");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !user) return err("Invalid session");

  const { data: member, error: memberError } = await adminClient
    .from("team_members")
    .select("organization_id, is_owner")
    .eq("id", user.id)
    .single();
  if (memberError || !member) return err("Team member not found");
  if (!member.is_owner) return err("Only the account owner can delete the account");

  // Best-effort Stripe cancellation — never blocks account deletion. If this
  // fails (network hiccup, already canceled, etc.) we still honor the user's
  // deletion request; the failure is captured for follow-up.
  if (STRIPE_SECRET_KEY) {
    try {
      const { data: org } = await adminClient
        .from("organizations")
        .select("stripe_subscription_id")
        .eq("id", member.organization_id)
        .single();

      if (org?.stripe_subscription_id) {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2024-12-18.acacia",
          httpClient: Stripe.createFetchHttpClient(),
        });
        await stripe.subscriptions.cancel(org.stripe_subscription_id);
      }
    } catch (e: unknown) {
      await captureServerEvent("account_deletion_stripe_cancel_failed", `org_${member.organization_id}`, {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Forward the caller's own JWT (not the service-role key) so auth.uid()
  // inside delete_my_account() resolves to this user — a service-role call
  // has no user context and the RPC would reject it as unauthenticated.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.rpc("delete_my_account");
  if (error) return err(error.message);

  return ok(data);
});
