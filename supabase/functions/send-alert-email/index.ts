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
 *                      Default: onboarding@resend.dev (works without domain setup)
 */

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const ALERT_SECRET    = Deno.env.get("ALERT_SECRET");
const FROM_EMAIL      = Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface AlertPayload {
  id:              string;
  type:            string;   // "warn" | "error"
  message:         string;
  area:            string | null;
  time:            string | null;
  source:          string | null;
  created_at:      string;
  organization_id: string;
  recipient_email: string;  // resolved by trigger from locations.alert_email
}

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

  // ── Build email content ─────────────────────────────────────────
  const severityLabel = alert.type === "error" ? "🔴 Error" : "⚠️ Warning";
  const subject       = `${severityLabel}: ${alert.message}`;

  const when = alert.created_at
    ? new Date(alert.created_at).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : (alert.time ?? "unknown time");

  const textBody = [
    "Olia Operational Alert",
    "",
    `Severity : ${(alert.type ?? "warn").toUpperCase()}`,
    `Message  : ${alert.message}`,
    alert.area   ? `Checklist: ${alert.area}`   : null,
    `Recorded : ${when}`,
    alert.source ? `Source   : ${alert.source}` : null,
    "",
    "---",
    "You are receiving this because your location has alert notifications enabled.",
    "Log in to Olia to view and dismiss this alert.",
  ].filter((l): l is string => l !== null).join("\n");

  const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;color:#1E1410">
  <div style="background:#1A2A47;padding:16px 24px;border-radius:8px 8px 0 0">
    <span style="color:#fff;font-size:16px;font-weight:bold">Olia</span>
    <span style="color:#B8A5C8;font-size:12px;margin-left:8px">Operational Alert</span>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#1A2A47">
      ${severityLabel}&nbsp; ${esc(alert.message)}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${alert.area ? row("Checklist", alert.area) : ""}
      ${row("Recorded", when)}
      ${alert.source ? row("Source", alert.source) : ""}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#857B72">
      You are receiving this because your location has alert notifications enabled.
      Log in to Olia to view and dismiss this alert.
    </p>
  </div>
</body>
</html>`;

  // ── Send via Resend ─────────────────────────────────────────────
  const resendRes = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
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

// ── Helpers ─────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#857B72;width:90px">${esc(label)}</td>
    <td style="padding:6px 0;font-weight:500">${esc(value)}</td>
  </tr>`;
}
