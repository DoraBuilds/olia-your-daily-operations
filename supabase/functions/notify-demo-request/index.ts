/**
 * notify-demo-request
 *
 * Called directly from the DemoModal component after a successful insert.
 * Auth: verifies the request carries a valid Supabase JWT (anon or user session).
 *
 * Required secrets — all already set:
 *   RESEND_API_KEY    → from send-alert-email setup
 *   SUPABASE_ANON_KEY → auto-available in all edge functions
 *
 * Optional:
 *   DEMO_TO_EMAIL     → notification recipient (default: dora.angelov@gmail.com)
 *   DEMO_FROM_EMAIL   → verified Resend sender (falls back to ALERT_FROM_EMAIL)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const DEMO_FROM_EMAIL = Deno.env.get("DEMO_FROM_EMAIL") ?? Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const DEMO_TO_EMAIL   = Deno.env.get("DEMO_TO_EMAIL")   ?? "dora.angelov@gmail.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface DemoRequest {
  name: string;
  email: string;
  venue_name?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify the caller has a valid Supabase JWT (anon or authenticated session).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { error: authError } = await supabase.auth.getUser();
  // anon JWTs return an auth error ("not authenticated") but are still valid tokens.
  // We just need the JWT to be a real Supabase-issued token, not arbitrary garbage.
  // Re-verify by checking the token decodes correctly against the anon key.
  // Simplest: if getUser() errors with "invalid JWT" it's forged; "not authenticated" is fine.
  if (authError && authError.message.toLowerCase().includes("invalid")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let demo: DemoRequest;
  try {
    demo = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!demo.name || !demo.email) {
    return json({ error: "Missing required fields" }, 400);
  }

  if (!RESEND_API_KEY) {
    console.error("notify-demo-request: RESEND_API_KEY not configured");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;")
     .replace(/'/g, "&#39;");

  const safeName  = esc(demo.name);
  const safeEmail = esc(demo.email);
  const safeVenue = demo.venue_name ? esc(demo.venue_name) : null;

  const venue   = safeVenue ? ` (${safeVenue})` : "";
  const subject = `Demo request: ${safeName}${venue}`;
  const html = `
    <p><strong>Name:</strong> ${safeName}</p>
    <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    ${safeVenue ? `<p><strong>Venue:</strong> ${safeVenue}</p>` : ""}
    <hr />
    <p style="color:#666;font-size:12px;">View all in Supabase → Table Editor → demo_requests</p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from: DEMO_FROM_EMAIL,
      to:   [DEMO_TO_EMAIL],
      subject,
      html,
    }),
  });

  const resBody = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`notify-demo-request: Resend error ${res.status}`, JSON.stringify(resBody));
    return json({ error: "Resend API error", detail: resBody }, 502);
  }

  console.log(`notify-demo-request: sent → ${DEMO_TO_EMAIL}, resend_id=${resBody?.id}`);
  return json({ sent: true, resend_id: resBody?.id }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":                 "application/json",
      "Access-Control-Allow-Origin":  "*",
    },
  });
}
