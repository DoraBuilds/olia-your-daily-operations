/**
 * check-checklist-alerts
 *
 * Checks for unstarted and unfinished checklists for the current day
 * and sends a summary email to the configured recipient.
 *
 * Called from the Admin → Notifications panel ("Test" button or daily cron).
 * Requires a valid Supabase user JWT in the Authorization header.
 *
 * Required secrets:
 *   RESEND_API_KEY      → Resend API key
 *   ALERT_FROM_EMAIL    → Verified sender address (default: onboarding@resend.dev)
 *
 * Body (JSON):
 *   recipient_email?    → Override recipient (used for test sends)
 *   test?               → boolean — if true, skips the "enabled" check
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY");
const ALERT_FROM_EMAIL   = Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const RESEND_ENDPOINT    = "https://api.resend.com/emails";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Validate caller JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Create an anon-scoped client so we can validate the JWT and get the user
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Use service role for DB queries (bypass RLS for reading checklists + logs)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Resolve the caller's organization
  const { data: memberRow, error: memberErr } = await admin
    .from("team_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberErr || !memberRow) {
    return json({ error: "No team_members row found for caller" }, 403);
  }
  if (memberRow.role !== "Owner") {
    return json({ error: "Only Owners can trigger checklist notifications" }, 403);
  }

  const orgId = memberRow.organization_id;

  // Parse request body
  let body: { recipient_email?: string; test?: boolean } = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine */ }

  // Fetch notification rules
  const { data: rules } = await admin
    .from("checklist_notification_rules")
    .select("enabled, recipient_email, notify_unstarted, notify_unfinished, notify_hour")
    .eq("organization_id", orgId)
    .maybeSingle();

  const isTest = body.test === true;

  // Skip if disabled and this isn't a manual test send
  if (!isTest && !rules?.enabled) {
    return json({ skipped: true, reason: "notifications disabled" }, 200);
  }

  const recipient = body.recipient_email?.trim() || rules?.recipient_email?.trim();
  if (!recipient) {
    return json({ error: "No recipient_email configured" }, 400);
  }

  const notifyUnstarted  = rules?.notify_unstarted  ?? true;
  const notifyUnfinished = rules?.notify_unfinished ?? true;

  // Today's window (UTC)
  const now   = new Date();
  const start = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const end   = new Date(now.toISOString().slice(0, 10) + "T23:59:59Z");

  // Fetch today's logs for the org
  const { data: logs } = await admin
    .from("checklist_logs")
    .select("checklist_id, checklist_title, score, completed_by, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  const todaysLogs = logs ?? [];

  // Unfinished = submitted today with null score
  const unfinished = notifyUnfinished
    ? todaysLogs.filter(l => l.score === null).map(l => l.checklist_title)
    : [];

  // Unstarted = active checklists with no log entry today
  let unstarted: string[] = [];
  if (notifyUnstarted) {
    const { data: checklists } = await admin
      .from("checklists")
      .select("id, title, start_date")
      .eq("organization_id", orgId);

    const loggedIds = new Set(todaysLogs.map(l => l.checklist_id).filter(Boolean));
    unstarted = (checklists ?? [])
      .filter(c => {
        if (loggedIds.has(c.id)) return false;
        if (c.start_date && new Date(c.start_date) > end) return false;
        return true;
      })
      .map(c => c.title);
  }

  const hasAnything = unstarted.length > 0 || unfinished.length > 0;

  // Nothing to report (and this is a scheduled run, not a manual test)
  if (!isTest && !hasAnything) {
    return json({ sent: false, reason: "nothing to report today" }, 200);
  }

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  // Build email
  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
       <ul style="margin:0;padding-left:18px">${unstarted.map(t => `<li style="margin-bottom:4px">${t}</li>`).join("")}</ul>`
    : "";
  const htmlUnfinished = unfinished.length > 0
    ? `<h3 style="color:#C05621;margin:16px 0 8px">⚠️ Unfinished (${unfinished.length})</h3>
       <ul style="margin:0;padding-left:18px">${unfinished.map(t => `<li style="margin-bottom:4px">${t}</li>`).join("")}</ul>`
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

  const resendRes = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    ALERT_FROM_EMAIL,
      to:      [recipient],
      subject,
      text:    textBody,
      html:    htmlBody,
    }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error("check-checklist-alerts: Resend error", resendRes.status, resendBody);
    return json({ error: "Resend API error", detail: resendBody }, 502);
  }

  console.log(`check-checklist-alerts: sent to ${recipient} — unstarted=${unstarted.length} unfinished=${unfinished.length}`);

  return json({
    sent: true,
    recipient,
    unstarted: unstarted.length,
    unfinished: unfinished.length,
    resend_id: resendBody?.id,
  }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
