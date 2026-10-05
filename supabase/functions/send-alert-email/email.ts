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
  question_text?: string | null;
  response_text?: string | null;
  location_name?: string | null;
  staff_name?: string | null;
  timezone?: string | null;
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

export function formatAlertWhen(createdAt: string, fallbackTime?: string | null, timeZone?: string | null): string {
  if (createdAt) {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    // Local time of the kiosk that raised the alert; UTC when unknown/invalid.
    try {
      return new Date(createdAt).toLocaleString("en-GB", { ...options, timeZone: timeZone || "UTC" });
    } catch {
      return new Date(createdAt).toLocaleString("en-GB", { ...options, timeZone: "UTC" });
    }
  }

  return fallbackTime ?? "unknown time";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildAlertEmail(alert: AlertPayload) {
  const when = formatAlertWhen(alert.created_at, alert.time, alert.timezone);

  // Alerts raised from a kiosk answer carry the question, response, location
  // and staff member: those get the structured "Warning" layout (#1072).
  // Anything else (older alerts, manual alerts) keeps the plain layout.
  if (alert.question_text) {
    const alertUrl = `${APP_URL}/notifications?alert=${encodeURIComponent(alert.id)}`;
    const severityLabel = "⚠️ Warning";
    const finding = alert.response_text
      ? `${alert.question_text}: recorded ${alert.response_text}`
      : `${alert.question_text}: not answered`;
    const subject = `${severityLabel}: ${finding}${alert.location_name ? ` - ${alert.location_name}` : ""}`;
    const rows: Array<[string, string]> = [];
    if (alert.location_name) rows.push(["Location", alert.location_name]);
    if (alert.area) rows.push(["Checklist", alert.area]);
    if (alert.staff_name) rows.push(["Staff", alert.staff_name]);
    rows.push(["Date/time", when]);

    const textBody = [
      "Olia Operational Alert",
      "",
      `${severityLabel}: ${finding}`,
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "---",
      "You are receiving this because a checklist notification rule matched.",
      "Log in to Olia to view and dismiss this alert.",
    ].join("\n");

    const htmlBody = emailShell({
      eyebrow: "Operational alert",
      bodyHtml: `<p class="o-ink" style="margin:0 0 20px;font-family:${SERIF};font-size:22px;line-height:1.3;color:${BRAND.ink}">
        ${severityLabel}:&nbsp;${esc(finding)}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="o-tint" style="border-collapse:collapse;font-size:14px;border-left:3px solid ${BRAND.teal};background:${BRAND.page}">
        ${rows.map(([label, value]) => row(label, value)).join("")}
      </table>
      ${emailButton("Open Olia", alertUrl)}`,
      footerHtml: "You are receiving this because a checklist notification rule matched. Log in to Olia to view and dismiss this alert.",
    });

    return { severityLabel, subject, when, textBody, htmlBody };
  }

  const severityLabel =
    alert.type === "error" ? "🔴 Error" :
    alert.type === "warn"  ? "⚠️ Warning" :
                             "🚨 Notification";
  const subject = `${severityLabel}: ${alert.message}`;

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
      ${emailButton("Open Olia", `${APP_URL}/notifications?alert=${encodeURIComponent(alert.id)}`)}`,
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
