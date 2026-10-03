import { APP_URL, BRAND, SERIF, emailButton, emailShell, esc } from "../_shared/email-layout.ts";

export interface ChecklistLogRow {
  checklist_id: string | null;
  checklist_title: string;
  score: number | null;
}

export interface ChecklistRow {
  id: string;
  title: string;
  start_date: string | null;
}

export function computeUnfinished(logs: ChecklistLogRow[]): string[] {
  return logs.filter(l => l.score === null).map(l => l.checklist_title);
}

export function computeUnstarted(
  checklists: ChecklistRow[],
  todaysLogs: ChecklistLogRow[],
  asOf: Date,
): string[] {
  const loggedIds = new Set(todaysLogs.map(l => l.checklist_id).filter(Boolean));
  return checklists
    .filter(c => {
      if (loggedIds.has(c.id)) return false;
      if (c.start_date && new Date(c.start_date) > asOf) return false;
      return true;
    })
    .map(c => c.title);
}

export interface DigestEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export function buildDigestEmail(opts: {
  dateStr: string;
  unstarted: string[];
  unfinished: string[];
  isTest: boolean;
}): DigestEmail {
  const { dateStr, unstarted, unfinished, isTest } = opts;
  const hasAnything = unstarted.length > 0 || unfinished.length > 0;

  const subject = isTest
    ? `[Olia] Checklist notification test — ${dateStr}`
    : `[Olia] Incomplete checklists for ${dateStr}`;

  const unstartedSection = unstarted.length > 0
    ? `\n🔲 NOT STARTED (${unstarted.length})\n${unstarted.map(t => `  • ${t}`).join("\n")}`
    : "";
  const unfinishedSection = unfinished.length > 0
    ? `\n⚠️ UNFINISHED (${unfinished.length})\n${unfinished.map(t => `  • ${t}`).join("\n")}`
    : "";
  const nothingPending = isTest && !hasAnything
    ? "\n✅ All checklists are on track today — this is a test email."
    : "";

  const textBody = [
    `Checklist summary for ${dateStr}`,
    "─".repeat(40),
    unstartedSection,
    unfinishedSection,
    nothingPending,
    "",
    "Open Olia to take action.",
  ].filter(Boolean).join("\n");

  const htmlUnstarted = unstarted.length > 0
    ? `<h3 style="color:${BRAND.tealDeep};font-size:15px;margin:20px 0 8px">🔲 Not started (${unstarted.length})</h3>
       <ul style="margin:0;padding-left:18px">${unstarted.map(t => `<li style="margin-bottom:4px">${esc(t)}</li>`).join("")}</ul>`
    : "";
  const htmlUnfinished = unfinished.length > 0
    ? `<h3 style="color:${BRAND.tealDeep};font-size:15px;margin:20px 0 8px">⚠️ Unfinished (${unfinished.length})</h3>
       <ul style="margin:0;padding-left:18px">${unfinished.map(t => `<li style="margin-bottom:4px">${esc(t)}</li>`).join("")}</ul>`
    : "";
  const htmlNothingPending = isTest && !hasAnything
    ? `<p style="color:${BRAND.tealDeep}">✅ All checklists are on track today — this is a test email.</p>`
    : "";

  const htmlBody = emailShell({
    eyebrow: isTest ? "Test digest" : "Daily digest",
    bodyHtml: `<p style="margin:0 0 4px;font-family:${SERIF};font-size:22px;line-height:1.3">Checklist summary</p>
      <p class="o-muted" style="margin:0 0 8px;color:${BRAND.muted};font-size:14px">${esc(dateStr)}</p>
      ${htmlUnstarted}
      ${htmlUnfinished}
      ${htmlNothingPending}
      ${emailButton("Open Olia", APP_URL)}`,
    footerHtml: `Sent by Olia · <a href="${APP_URL}" style="color:${BRAND.tealDeep}">oliahq.com</a>`,
  });

  return { subject, textBody, htmlBody };
}
