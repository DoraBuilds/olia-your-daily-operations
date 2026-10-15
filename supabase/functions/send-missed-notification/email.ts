import { APP_URL, BRAND, emailButton, emailShell, esc } from "../_shared/email-layout.ts";

export interface MissedItem {
  title: string;
  window_from?: string | null;
  window_until?: string | null;
  route?: string | null;
  operating_date?: string | null;
  reason?: string | null;
  note?: string | null;
}

export interface MissedPayload {
  recipient_email: string;
  recipient_name?: string | null;
  location_name?: string | null;
  items: MissedItem[];
}

const REASON_LABELS: Record<string, string> = {
  short_staffed: "Short-staffed",
  equipment_issue: "Equipment issue",
  forgot: "Forgot",
  other: "Other",
};

const MAX_ITEMS = 50;

export function isValidPayload(p: unknown): p is MissedPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.recipient_email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.recipient_email) &&
    Array.isArray(o.items) &&
    o.items.length > 0 &&
    o.items.every((i) => i && typeof i === "object" && typeof (i as MissedItem).title === "string")
  );
}

function routeText(route?: string | null): string {
  return route === "after_overdue"
    ? "Missed after Overdue (the team had until the end of the day)"
    : "Missed when the due window closed";
}

function windowText(i: MissedItem): string {
  return i.window_from && i.window_until ? `Due ${i.window_from} - ${i.window_until}` : "";
}

export function buildMissedEmail(p: MissedPayload): { subject: string; textBody: string; htmlBody: string } {
  const items = p.items.slice(0, MAX_ITEMS);
  const extra = p.items.length - items.length;
  const where = p.location_name?.trim() || "your location";
  const count = p.items.length;
  const subject = `${count === 1 ? "1 checklist" : `${count} checklists`} missed at ${where}`;
  const greeting = p.recipient_name?.trim() ? `Hi ${p.recipient_name.trim().split(" ")[0]},` : "Hi,";

  const textLines = items.map((i) => {
    const parts = [`- ${i.title}`, windowText(i), routeText(i.route)].filter(Boolean);
    if (i.reason || i.note) {
      parts.push(`Note: ${[i.reason ? REASON_LABELS[i.reason] ?? i.reason : "", i.note ?? ""].filter(Boolean).join(" - ")}`);
    }
    return parts.join("\n  ");
  });
  const textBody = [
    greeting,
    "",
    `${count === 1 ? "A checklist was" : "These checklists were"} missed at ${where}:`,
    "",
    ...textLines,
    ...(extra > 0 ? ["", `...and ${extra} more.`] : []),
    "",
    `Open Olia: ${APP_URL}`,
    "",
    "You get this because you turned on Missed checklist notifications in Account > Notifications.",
  ].join("\n");

  const rows = items
    .map((i) => {
      const note = i.reason || i.note
        ? `<div style="margin-top:6px;color:${BRAND.muted};font-size:13px"><strong>${esc(i.reason ? REASON_LABELS[i.reason] ?? i.reason : "")}</strong>${i.reason && i.note ? ": " : ""}${esc(i.note ?? "")}</div>`
        : "";
      return `<tr><td style="padding:12px 0;border-top:1px solid ${BRAND.border}">
        <div style="font-weight:600">${esc(i.title)}</div>
        <div style="color:${BRAND.muted};font-size:13px">${esc([windowText(i), routeText(i.route)].filter(Boolean).join(" · "))}</div>
        ${note}
      </td></tr>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting)}</p>
    <p style="margin:0 0 16px">${count === 1 ? "A checklist was" : "These checklists were"} missed at <strong>${esc(where)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${extra > 0 ? `<p style="margin:12px 0 0;color:${BRAND.muted}">...and ${extra} more.</p>` : ""}
    ${emailButton("Open Olia", APP_URL)}`;

  const htmlBody = emailShell({
    eyebrow: "Missed",
    bodyHtml,
    footerHtml: "You get this because you turned on Missed checklist notifications in Account &gt; Notifications.",
  });

  return { subject, textBody, htmlBody };
}
