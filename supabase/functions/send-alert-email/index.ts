/**
 * send-alert-email
 *
 * Called by the Postgres trigger `trg_send_alert_email` via pg_net
 * whenever a new row is inserted into public.alerts.
 *
 * Environment variable required (set in Supabase Dashboard →
 * Settings → Edge Functions → Secrets):
 *   RESEND_API_KEY   → your Resend API key (starts with "re_")
 *
 * Optional:
 *   ALERT_FROM_EMAIL → sender address (default: alerts@notifications.olia.app)
 *                      Must be a domain you have verified in Resend.
 */

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL      = Deno.env.get("ALERT_FROM_EMAIL") ?? "alerts@notifications.olia.app";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface AlertPayload {
  id:              string;
  type:            "error" | "warn" | string;
  message:         string;
  area:            string | null;    // checklist title
  time:            string | null;    // "HH:MM" local time from kiosk
  source:          string | null;    // "kiosk" | "system" | "action"
  created_at:      string;
  organization_id: string;
  recipient_email: string;           // resolved by trigger from locations.alert_email
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Parse payload ───────────────────────────────────────────────
  let alert: AlertPayload;
  try {
    alert = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // ── Validate required fields ────────────────────────────────────
  if (!alert.recipient_email) {
    console.log("send-alert-email: no recipient_email in payload — skipping");
    return json({ skipped: true, reason: "no recipient_email" }, 200);
  }

  if (!alert.message) {
    console.warn("send-alert-email: payload missing message field");
    return json({ error: "missing message field" }, 400);
  }

  // ── Check API key ───────────────────────────────────────────────
  if (!RESEND_API_KEY) {
    console.error("send-alert-email: RESEND_API_KEY secret is not set");
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  // ── Build email ─────────────────────────────────────────────────
  const severityLabel = alert.type === "error" ? "🔴 Error" : "⚠️ Warning";
  const subject       = `${severityLabel}: ${alert.message}`;

  // Readable datetime from the ISO timestamp
  const when = alert.created_at
    ? new Date(alert.created_at).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : alert.time ?? "unknown time";

  const textBody = [
    `Olia Operational Alert`,
    ``,
    `Severity : ${alert.type?.toUpperCase() ?? "WARN"}`,
    `Message  : ${alert.message}`,
    alert.area   ? `Checklist: ${alert.area}`   : null,
    `Recorded : ${when}`,
    alert.source ? `Source   : ${alert.source}` : null,
    ``,
    `---`,
    `You are receiving this because your location has alert notifications enabled.`,
    `Log in to Olia to view and dismiss this alert.`,
  ].filter(line => line !== null).join("\n");

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;color:#1E1410">
  <div style="background:#1A2A47;padding:16px 24px;border-radius:8px 8px 0 0">
    <span style="color:#fff;font-size:16px;font-weight:bold">Olia</span>
    <span style="color:#B8A5C8;font-size:12px;margin-left:8px">Operational Alert</span>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#1A2A47">
      ${severityLabel}&nbsp;&nbsp;${escapeHtml(alert.message)}
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
  const resendResponse = await fetch(RESEND_ENDPOINT, {
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

  const resendBody = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    console.error(
      `send-alert-email: Resend returned ${resendResponse.status}`,
      JSON.stringify(resendBody)
    );
    return json(
      { error: "Resend API error", status: resendResponse.status, detail: resendBody },
      502
    );
  }

  console.log(
    `send-alert-email: delivered alert ${alert.id} → ${alert.recipient_email}`,
    `resend_id=${resendBody?.id}`
  );

  return json({ sent: true, resend_id: resendBody?.id }, 200);
});

// ── Helpers ────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:#857B72;width:90px">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-weight:500">${escapeHtml(value)}</td>
    </tr>`;
}
