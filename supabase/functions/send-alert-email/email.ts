export interface AlertPayload {
  id: string;
  type: string;
  message: string;
  area: string | null;
  time: string | null;
  source: string | null;
  created_at: string;
  organization_id: string;
  recipient_email: string;
}

export const DEV_FALLBACK_FROM_EMAIL = "onboarding@resend.dev";

export interface SenderResolutionResult {
  fromEmail: string | null;
  usedFallback: boolean;
}

export function resolveFromEmail(alertFromEmail?: string | null): SenderResolutionResult {
  const trimmed = alertFromEmail?.trim();
  if (trimmed) {
    return { fromEmail: trimmed, usedFallback: false };
  }

  return {
    fromEmail: DEV_FALLBACK_FROM_EMAIL,
    usedFallback: true,
  };
}

export function formatAlertWhen(createdAt: string, fallbackTime?: string | null): string {
  if (createdAt) {
    return new Date(createdAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return fallbackTime ?? "unknown time";
}

export function buildAlertEmail(alert: AlertPayload) {
  const severityLabel = alert.type === "error" ? "🔴 Error" : "⚠️ Warning";
  const subject = `${severityLabel}: ${alert.message}`;
  const when = formatAlertWhen(alert.created_at, alert.time);

  const textBody = [
    "Olia Operational Alert",
    "",
    `Severity : ${(alert.type ?? "warn").toUpperCase()}`,
    `Message  : ${alert.message}`,
    alert.area ? `Checklist: ${alert.area}` : null,
    `Recorded : ${when}`,
    alert.source ? `Source   : ${alert.source}` : null,
    "",
    "---",
    "You are receiving this because your location has alert notifications enabled.",
    "Log in to Olia to view and dismiss this alert.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

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

  return {
    severityLabel,
    subject,
    when,
    textBody,
    htmlBody,
  };
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
