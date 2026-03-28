/**
 * send-alert-email
 *
 * Called by the Postgres trigger `trg_send_alert_email` via pg_net
 * whenever a new row is inserted into public.alerts.
 *
 * Authentication: shared secret passed as `x-alert-secret` header.
 * No Supabase credentials are used or required.
 *
 * Required secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   RESEND_API_KEY  → your Resend API key (starts with "re_")
 *   ALERT_SECRET    → same random string you set in:
 *                     ALTER DATABASE postgres SET app.alert_secret = '...';
 *
 * Optional:
 *   ALERT_FROM_EMAIL → verified sender address in Resend
 *                      Default: onboarding@resend.dev (development fallback only)
 */

import {
  buildAlertEmail,
  resolveFromEmail,
  type AlertPayload,
} from "./email.ts";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const ALERT_SECRET    = Deno.env.get("ALERT_SECRET");
const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL");
const RESEND_ENDPOINT = "https://api.resend.com/emails";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Validate shared secret ──────────────────────────────────────
  // Reject anything that doesn't carry the correct x-alert-secret header.
  // This prevents anyone on the internet from triggering emails even if
  // they discover the function URL.
  const incomingSecret = req.headers.get("x-alert-secret");

  if (!ALERT_SECRET) {
    console.error("send-alert-email: ALERT_SECRET secret is not configured in Edge Function secrets");
    return json({ error: "Server misconfiguration: ALERT_SECRET not set" }, 500);
  }

  if (!incomingSecret || incomingSecret !== ALERT_SECRET) {
    console.warn("send-alert-email: rejected request with invalid or missing x-alert-secret");
    return json({ error: "Unauthorized" }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────
  let alert: AlertPayload;
  try {
    alert = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!alert.message) {
    return json({ error: "Missing required field: message" }, 400);
  }

  if (!alert.recipient_email) {
    // Trigger already filters this, but guard here too.
    console.log("send-alert-email: no recipient_email — skipping");
    return json({ skipped: true, reason: "no recipient_email" }, 200);
  }

  // ── Validate Resend key ─────────────────────────────────────────
  if (!RESEND_API_KEY) {
    console.error("send-alert-email: RESEND_API_KEY secret is not configured");
    return json({ error: "Server misconfiguration: RESEND_API_KEY not set" }, 500);
  }

  const sender = resolveFromEmail(ALERT_FROM_EMAIL);

  if (sender.usedFallback) {
    console.warn(
      "send-alert-email: ALERT_FROM_EMAIL is not configured; using onboarding@resend.dev fallback",
    );
  }

  // ── Build email content ─────────────────────────────────────────
  const { subject, textBody, htmlBody } = buildAlertEmail(alert);

  // ── Send via Resend ─────────────────────────────────────────────
  const resendRes = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    sender.fromEmail,
      to:      [alert.recipient_email],
      subject,
      text:    textBody,
      html:    htmlBody,
    }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error(
      `send-alert-email: Resend error ${resendRes.status}`,
      JSON.stringify(resendBody)
    );
    return json(
      { error: "Resend API error", status: resendRes.status, detail: resendBody },
      502
    );
  }

  console.log(
    `send-alert-email: sent alert ${alert.id} → ${alert.recipient_email}`,
    `resend_id=${resendBody?.id}`
  );

  return json({ sent: true, resend_id: resendBody?.id }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
