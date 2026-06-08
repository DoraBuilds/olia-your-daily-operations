/**
 * notify-demo-request
 *
 * Called by the Postgres trigger `trg_notify_demo_request` via pg_net
 * whenever a new row is inserted into public.demo_requests.
 *
 * Required secrets — all already set, nothing new to add:
 *   RESEND_API_KEY  → already set from send-alert-email
 *   ALERT_SECRET    → already set from send-alert-email; reused here as the
 *                     shared secret (the DB trigger sends app.alert_secret)
 *
 * Optional:
 *   DEMO_FROM_EMAIL → verified sender in Resend (default: onboarding@resend.dev)
 *   DEMO_TO_EMAIL   → where to send the notification (default: dora.angelov@gmail.com)
 */

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
// Reuse ALERT_SECRET so no new DB setting is needed.
const DEMO_SECRET     = Deno.env.get("ALERT_SECRET");
const DEMO_FROM_EMAIL = Deno.env.get("DEMO_FROM_EMAIL") ?? "onboarding@resend.dev";
const DEMO_TO_EMAIL   = Deno.env.get("DEMO_TO_EMAIL")   ?? "dora.angelov@gmail.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface DemoRequest {
  id: string;
  name: string;
  email: string;
  venue_name?: string | null;
  created_at: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!DEMO_SECRET) {
    console.error("notify-demo-request: ALERT_SECRET not configured");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const incomingSecret = req.headers.get("x-demo-secret");
  if (!incomingSecret || incomingSecret !== DEMO_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  let demo: DemoRequest;
  try {
    demo = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
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

  const venue = safeVenue ? ` (${safeVenue})` : "";
  const subject = `Demo request: ${safeName}${venue}`;
  const html = `
    <p><strong>Name:</strong> ${safeName}</p>
    <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    ${safeVenue ? `<p><strong>Venue:</strong> ${safeVenue}</p>` : ""}
    <p><strong>Submitted:</strong> ${new Date(demo.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
    <hr />
    <p style="color:#666;font-size:12px;">View all requests in <a href="https://supabase.com/dashboard">Supabase Dashboard</a> → Table Editor → demo_requests</p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    DEMO_FROM_EMAIL,
      to:      [DEMO_TO_EMAIL],
      subject,
      html,
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`notify-demo-request: Resend error ${res.status}`, JSON.stringify(body));
    return json({ error: "Resend API error", detail: body }, 502);
  }

  console.log(`notify-demo-request: sent → ${DEMO_TO_EMAIL}, resend_id=${body?.id}`);
  return json({ sent: true, resend_id: body?.id }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
