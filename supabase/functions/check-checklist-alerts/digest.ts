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
    ? `<h3 style="color:#C05621;margin:16px 0 8px">🔲 Not started (${unstarted.length})</h3>
       <ul style="margin:0;padding-left:18px">${unstarted.map(t => `<li style="margin-bottom:4px">${esc(t)}</li>`).join("")}</ul>`
    : "";
  const htmlUnfinished = unfinished.length > 0
    ? `<h3 style="color:#C05621;margin:16px 0 8px">⚠️ Unfinished (${unfinished.length})</h3>
       <ul style="margin:0;padding-left:18px">${unfinished.map(t => `<li style="margin-bottom:4px">${esc(t)}</li>`).join("")}</ul>`
    : "";
  const htmlNothingPending = isTest && !hasAnything
    ? `<p style="color:#2D6A4F">✅ All checklists are on track today — this is a test email.</p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a2a47">
  <h2 style="margin:0 0 4px;font-size:20px">Checklist summary</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:14px">${dateStr}</p>
  ${htmlUnstarted}
  ${htmlUnfinished}
  ${htmlNothingPending}
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="font-size:12px;color:#9ca3af">Sent by Olia · <a href="https://oliahq.com" style="color:#6b7280">oliahq.com</a></p>
</body>
</html>`;

  return { subject, textBody, htmlBody };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
