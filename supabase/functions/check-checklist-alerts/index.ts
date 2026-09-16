/**
 * check-checklist-alerts
 *
 * Checks for unstarted and unfinished checklists for the current day
 * and sends a summary email to the configured recipient.
 *
 * Two call paths:
 *  - Owner-triggered: the Admin → Notifications panel's "Test" button (or
 *    any manual invocation) sends a Supabase user JWT and only checks the
 *    caller's own organization, regardless of notify_hour.
 *  - Scheduled sweep: pg_cron calls this hourly (see migration
 *    20260916000001_checklist_alerts_cron.sql) with a shared `x-alert-secret`
 *    header instead of a user session, and it sends for every organization
 *    whose notify_hour matches the current UTC hour.
 *
 * Required secrets:
 *   RESEND_API_KEY   → Resend API key
 *   ALERT_FROM_EMAIL → Verified sender address (default: onboarding@resend.dev)
 *   ALERT_SECRET     → shared secret that authenticates the cron sweep
 *                       (same value already configured for send-alert-email)
 *
 * Body (JSON), owner-triggered path only:
 *   recipient_email? → Override recipient (used for test sends)
 *   test?            → boolean — if true, skips the "enabled" check
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildDigestEmail, computeUnfinished, computeUnstarted } from "./digest.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY");
const ALERT_FROM_EMAIL     = Deno.env.get("ALERT_FROM_EMAIL") ?? "onboarding@resend.dev";
const ALERT_SECRET         = Deno.env.get("ALERT_SECRET");
const RESEND_ENDPOINT      = "https://api.resend.com/emails";

interface DigestResult {
  sent: boolean;
  status: number;
  reason?: string;
  error?: string;
  detail?: unknown;
  recipient?: string;
  unstarted?: number;
  unfinished?: number;
  resend_id?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Scheduled sweep (pg_cron) ───────────────────────────────────
  const incomingSecret = req.headers.get("x-alert-secret");
  if (incomingSecret) {
    if (!ALERT_SECRET || incomingSecret !== ALERT_SECRET) {
      console.warn("check-checklist-alerts: rejected sweep request with invalid x-alert-secret");
      return json({ error: "Unauthorized" }, 401);
    }
    return await runSweep(admin);
  }

  // ── Owner-triggered (JWT) ───────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Anon-scoped client so we can validate the JWT and get the user.
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: memberRow, error: memberErr } = await admin
    .from("team_members")
    .select("organization_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (memberErr || !memberRow) {
    return json({ error: "No team_members row found for caller" }, 403);
  }
  if (memberRow.role !== "Owner") {
    return json({ error: "Only Owners can trigger checklist notifications" }, 403);
  }

  const orgId = memberRow.organization_id;

  let body: { recipient_email?: string; test?: boolean } = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine */ }

  const { data: rules } = await admin
    .from("checklist_notification_rules")
    .select("enabled, recipient_email, notify_unstarted, notify_unfinished, notify_hour")
    .eq("organization_id", orgId)
    .maybeSingle();

  const isTest = body.test === true;

  if (!isTest && !rules?.enabled) {
    return json({ skipped: true, reason: "notifications disabled" }, 200);
  }

  const recipient = body.recipient_email?.trim() || rules?.recipient_email?.trim();
  if (!recipient) {
    return json({ error: "No recipient_email configured" }, 400);
  }

  const result = await sendOrgDigest(admin, {
    orgId,
    recipient,
    notifyUnstarted: rules?.notify_unstarted ?? true,
    notifyUnfinished: rules?.notify_unfinished ?? true,
    isTest,
  });

  return json(result, result.status);
});

// ── Scheduled sweep ────────────────────────────────────────────────
async function runSweep(admin: SupabaseClient): Promise<Response> {
  const nowHourUTC = new Date().getUTCHours();

  const { data: rules, error } = await admin
    .from("checklist_notification_rules")
    .select("organization_id, recipient_email, notify_unstarted, notify_unfinished")
    .eq("enabled", true)
    .eq("notify_hour", nowHourUTC);

  if (error) {
    console.error("check-checklist-alerts sweep: failed to load rules", error);
    return json({ error: "Failed to load notification rules" }, 500);
  }

  const due = rules ?? [];
  const results: Array<{ organization_id: string } & DigestResult> = [];

  for (const rule of due) {
    const recipient = rule.recipient_email?.trim();
    if (!recipient) {
      results.push({ organization_id: rule.organization_id, sent: false, status: 200, reason: "no recipient configured" });
      continue;
    }
    const result = await sendOrgDigest(admin, {
      orgId: rule.organization_id,
      recipient,
      notifyUnstarted: rule.notify_unstarted,
      notifyUnfinished: rule.notify_unfinished,
      isTest: false,
    });
    results.push({ organization_id: rule.organization_id, ...result });
  }

  console.log(
    `check-checklist-alerts sweep: hour=${nowHourUTC} orgs_due=${due.length} sent=${results.filter(r => r.sent).length}`,
  );

  return json({ swept: true, hour: nowHourUTC, orgs_due: due.length, results }, 200);
}

// ── Shared digest builder + sender (used by both call paths) ───────
async function sendOrgDigest(
  admin: SupabaseClient,
  opts: { orgId: string; recipient: string; notifyUnstarted: boolean; notifyUnfinished: boolean; isTest: boolean },
): Promise<DigestResult> {
  const { orgId, recipient, notifyUnstarted, notifyUnfinished, isTest } = opts;

  // Today's window (UTC)
  const now   = new Date();
  const start = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const end   = new Date(now.toISOString().slice(0, 10) + "T23:59:59Z");

  const { data: logs } = await admin
    .from("checklist_logs")
    .select("checklist_id, checklist_title, score, completed_by, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  const todaysLogs = logs ?? [];
  const unfinished = notifyUnfinished ? computeUnfinished(todaysLogs) : [];

  let unstarted: string[] = [];
  if (notifyUnstarted) {
    const { data: checklists } = await admin
      .from("checklists")
      .select("id, title, start_date")
      .eq("organization_id", orgId);
    unstarted = computeUnstarted(checklists ?? [], todaysLogs, end);
  }

  const hasAnything = unstarted.length > 0 || unfinished.length > 0;

  // Nothing to report (and this is a scheduled run, not a manual test)
  if (!isTest && !hasAnything) {
    return { sent: false, status: 200, reason: "nothing to report today" };
  }

  if (!RESEND_API_KEY) {
    return { sent: false, status: 500, error: "RESEND_API_KEY not configured" };
  }

  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const { subject, textBody, htmlBody } = buildDigestEmail({ dateStr, unstarted, unfinished, isTest });

  const resendRes = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: ALERT_FROM_EMAIL, to: [recipient], subject, text: textBody, html: htmlBody }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error(`check-checklist-alerts: Resend error for org ${orgId}`, resendRes.status, resendBody);
    return { sent: false, status: 502, error: "Resend API error", detail: resendBody };
  }

  console.log(
    `check-checklist-alerts: sent to ${recipient} (org ${orgId}) — unstarted=${unstarted.length} unfinished=${unfinished.length}`,
  );

  return {
    sent: true,
    status: 200,
    recipient,
    unstarted: unstarted.length,
    unfinished: unfinished.length,
    resend_id: resendBody?.id,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
