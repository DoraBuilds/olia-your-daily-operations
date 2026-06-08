/**
 * notify-demo-request
 *
 * Called directly from DemoModal after a successful insert into demo_requests.
 *
 * Auth model: verifies the submitted email was actually inserted into
 * demo_requests within the last 60 seconds using the service role key.
 * This prevents the public endpoint from being used to send arbitrary emails —
 * a caller must first successfully insert a real row (subject to RLS), and
 * then call this function before the 60-second window closes.
 *
 * Also enforces per-email rate limiting (1 notification per 24 h) and
 * field length caps to prevent abuse.
 *
 * Required secrets — all auto-available in Supabase edge functions:
 *   RESEND_API_KEY          → set from send-alert-email setup
 *   SUPABASE_URL            → auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY → auto-injected
 *
 * Optional:
 *   DEMO_TO_EMAIL   → notification recipient (default: dora.angelov@gmail.com)
 *   DEMO_FROM_EMAIL → verified Resend sender (falls back to ALERT_FROM_EMAIL)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const DEMO_FROM_EMAIL = Deno.env.get("DEMO_FROM_EMAIL") ?? Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const DEMO_TO_EMAIL   = Deno.env.get("DEMO_TO_EMAIL")   ?? "dora.angelov@gmail.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

const MAX_NAME  = 120;
const MAX_EMAIL = 254;
const MAX_VENUE = 200;

interface DemoRequest {
  name: string;
  email: string;
  venue_name?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors() });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: DemoRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Field presence + length caps
  const name  = String(body.name  ?? "").trim().slice(0, MAX_NAME);
  const email = String(body.email ?? "").trim().slice(0, MAX_EMAIL).toLowerCase();
  const venue = body.venue_name ? String(body.venue_name).trim().slice(0, MAX_VENUE) : null;

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid fields" }, 400);
  }

  // Use the service role to verify a real insert happened for this email
  // within the last 60 seconds, and that no notification was sent in 24 h.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const since60s  = new Date(Date.now() - 60_000).toISOString();
  const since24h  = new Date(Date.now() - 86_400_000).toISOString();

  const { data: rows, error: dbError } = await supabase
    .from("demo_requests")
    .select("id, created_at")
    .eq("email", email)
    .gte("created_at", since60s)
    .order("created_at", { ascending: false })
    .limit(1);

  if (dbError) {
    console.error("notify-demo-request: db check failed", dbError);
    return json({ error: "Server error" }, 500);
  }

  // No matching insert in the last 60 s → this call wasn't triggered by the form
  if (!rows || rows.length === 0) {
    return json({ error: "No recent submission found" }, 403);
  }

  // Rate limit: has a notification already gone out for this email in the last 24 h?
  const { count } = await supabase
    .from("demo_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since24h);

  if ((count ?? 0) > 1) {
    // More than one submission from this email today — silently accept but skip email
    console.log(`notify-demo-request: rate-limited ${email}`);
    return json({ sent: false, reason: "rate_limited" }, 200);
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

  const safeName  = esc(name);
  const safeEmail = esc(email);
  const safeVenue = venue ? esc(venue) : null;

  const subject = `Demo request: ${safeName}${safeVenue ? ` (${safeVenue})` : ""}`;
  const html = `
    <p><strong>Name:</strong> ${safeName}</p>
    <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    ${safeVenue ? `<p><strong>Venue:</strong> ${safeVenue}</p>` : ""}
    <hr />
    <p style="color:#666;font-size:12px;">View all in Supabase → Table Editor → demo_requests</p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DEMO_FROM_EMAIL, to: [DEMO_TO_EMAIL], subject, html }),
  });

  const resBody = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`notify-demo-request: Resend error ${res.status}`, JSON.stringify(resBody));
    return json({ error: "Resend API error", detail: resBody }, 502);
  }

  console.log(`notify-demo-request: sent → ${DEMO_TO_EMAIL}, resend_id=${resBody?.id}`);
  return json({ sent: true, resend_id: resBody?.id }, 200);
});

function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "content-type",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
