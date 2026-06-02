// Shared plan enforcement for AI edge functions.
// Returns a 403 Response if the caller's org is on the starter plan (no AI features).
// Returns null if the caller is on growth or enterprise (allowed to proceed).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function enforcePaidPlan(
  authHeader: string | null
): Promise<Response | null> {
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Authentication required." }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Server configuration error." }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
        { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Fetch the org plan via the service role (bypasses RLS safely).
    // user.id is now verified — it cannot be spoofed via a crafted JWT payload.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/team_members?select=organizations(plan)&id=eq.${user.id}&limit=1`,
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
        { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const rows = await res.json();
    const plan: string = rows[0]?.organizations?.plan ?? "starter";

    if (plan === "starter") {
      return new Response(
        JSON.stringify({ error: "AI features require the Growth plan. Upgrade in Settings → Account." }),
        { status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    return null; // caller is on growth or enterprise — allow through
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not verify plan." }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}
