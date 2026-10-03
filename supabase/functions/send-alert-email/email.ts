import { APP_URL, BRAND, SERIF, emailButton, emailShell, esc } from "../_shared/email-layout.ts";

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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildAlertEmail(alert: AlertPayload) {
  const severityLabel =
    alert.type === "error" ? "🔴 Error" :
    alert.type === "warn"  ? "⚠️ Warning" :
                             "🚨 Notification";
  const subject = `${severityLabel}: ${alert.message}`;
  const when = formatAlertWhen(alert.created_at, alert.time);

  const textBody = [
    "Olia Operational Alert",
    "",
    `Severity : ${(alert.type ?? "warn").toUpperCase()}`,
    `Message  : ${alert.message}`,
    alert.area ? `Checklist: ${alert.area}` : null,
    `Recorded : ${when}`,
    alert.source ? `Source   : ${capitalize(alert.source)}` : null,
    "",
    "---",
    "You are receiving this because a checklist notification rule matched.",
    "Log in to Olia to view and dismiss this alert.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const htmlBody = emailShell({
    eyebrow: "Operational alert",
    bodyHtml: `<p class="o-ink" style="margin:0 0 20px;font-family:${SERIF};font-size:22px;line-height:1.3;color:${BRAND.ink}">
        ${severityLabel}&nbsp; ${esc(alert.message)}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="o-tint" style="border-collapse:collapse;font-size:14px;border-left:3px solid ${BRAND.teal};background:${BRAND.page}">
        ${alert.area ? row("Checklist", alert.area) : ""}
        ${row("Recorded", when)}
        ${alert.source ? row("Source", capitalize(alert.source)) : ""}
      </table>
      ${emailButton("Open Olia", APP_URL)}`,
    footerHtml: "You are receiving this because a checklist notification rule matched. Log in to Olia to view and dismiss this alert.",
  });

  return {
    severityLabel,
    subject,
    when,
    textBody,
    htmlBody,
  };
}

function row(label: string, value: string): string {
  return `<tr>
    <td class="o-muted" style="padding:10px 12px 10px 16px;color:${BRAND.muted};width:96px;vertical-align:top">${esc(label)}</td>
    <td class="o-ink" style="padding:10px 16px 10px 0;font-weight:600;color:${BRAND.ink}">${esc(value)}</td>
  </tr>`;
}
