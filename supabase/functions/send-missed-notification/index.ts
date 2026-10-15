/**
 * send-missed-notification
 *
 * Called by the Postgres trigger `trg_notify_missed_checklists` (via pg_net)
 * when checklists are recorded as Missed. One call per recipient per location,
 * already filtered to owners/managers who opted in.
 *
 * Authentication: shared `x-alert-secret` header, same as send-alert-email.
 * Secrets: RESEND_API_KEY, ALERT_SECRET, optional ALERT_FROM_EMAIL.
 */

import { buildMissedEmail, isValidPayload } from "./email.ts";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY");
const ALERT_SECRET     = Deno.env.get("ALERT_SECRET");
const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const RESEND_ENDPOINT  = "https://api.resend.com/emails";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!ALERT_SECRET) {
    console.error("send-missed-notification: ALERT_SECRET is not configured");
    return json({ error: "Server misconfiguration" }, 500);
  }
  if (req.headers.get("x-alert-secret") !== ALERT_SECRET) {
    console.warn("send-missed-notification: rejected request with invalid x-alert-secret");
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isValidPayload(payload)) return json({ error: "Invalid payload" }, 400);

  if (!RESEND_API_KEY) {
    console.error("send-missed-notification: RESEND_API_KEY is not configured");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const { subject, textBody, htmlBody } = buildMissedEmail(payload);
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: ALERT_FROM_EMAIL, to: [payload.recipient_email], subject, text: textBody, html: htmlBody }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("send-missed-notification: Resend error", res.status, JSON.stringify(body));
    return json({ error: "Resend API error", status: res.status }, 502);
  }
  console.log(`send-missed-notification: sent ${payload.items.length} item(s) to ${payload.recipient_email}`);
  return json({ sent: true, resend_id: body?.id }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
