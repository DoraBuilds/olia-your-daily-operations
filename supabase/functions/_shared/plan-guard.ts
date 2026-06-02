// Shared plan enforcement for AI edge functions.
// Returns a 403 Response if the caller's org is on the starter plan (no AI features).
// Returns a 429 Response if the org has exceeded its daily AI request limit.
// Returns null if the caller is allowed to proceed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AI_DAILY_LIMIT = parseInt(Deno.env.get("AI_DAILY_LIMIT") ?? "100", 10);

export async function enforcePaidPlan(
  authHeader: string | null,
  origin: string | null = null
): Promise<Response | null> {
  const CORS = corsHeaders(origin);

  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Authentication required." }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Server configuration error." }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  try {
    // Verify the JWT by calling auth.getUser() — Supabase validates the signature
    // server-side and returns the authenticated user, preventing crafted-payload attacks.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token." }),
        { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // Fetch the org plan and ID via the service role (bypasses RLS safely).
    // user.id is now verified — it cannot be spoofed via a crafted JWT payload.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/team_members?select=organization_id,organizations(plan)&id=eq.${user.id}&limit=1`,
      {
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Accept": "application/json",
        },
      }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Could not verify plan." }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const rows = await res.json();
    const orgId: string | undefined = rows[0]?.organization_id;
    const plan: string = rows[0]?.organizations?.plan ?? "starter";

    if (plan === "starter") {
      return new Response(
        JSON.stringify({ error: "AI features require the Growth plan. Upgrade in Settings → Account." }),
        { status: 403, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // Rate limit: atomically increment today's request count and check the limit.
    if (orgId) {
      const limitRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/check_and_increment_ai_usage`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_org_id: orgId, p_daily_limit: AI_DAILY_LIMIT }),
        }
      );
      if (limitRes.ok) {
        const allowed = await limitRes.json();
        if (!allowed) {
          return new Response(
            JSON.stringify({ error: "Daily AI request limit reached. Try again tomorrow." }),
            { status: 429, headers: { "Content-Type": "application/json", ...CORS } }
          );
        }
      }
    }

    return null; // caller is on a paid plan and within limits — allow through
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not verify plan." }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
}
