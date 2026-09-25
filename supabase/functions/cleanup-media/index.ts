/**
 * cleanup-media
 *
 * Daily storage sweep for the kiosk-photos and infohub-files buckets.
 * Deletes the files listed by public.media_cleanup_candidates()
 * (20260925000007_media_cleanup_sweep.sql):
 *   - expired              → checklist photos older than 2 years (Privacy Policy §5)
 *   - orphaned             → checklist photos never saved in a checklist log (2-day grace)
 *   - organization_deleted → files of organisations removed by the 30-day account purge
 *
 * Called by pg_cron (run_media_cleanup_sweep, daily 04:15 UTC) with the
 * shared `x-alert-secret` header — the same ALERT_SECRET used by
 * check-checklist-alerts. There is no user-facing call path.
 *
 * Body (JSON):
 *   dry_run? → boolean — list what would be deleted without deleting it
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALERT_SECRET         = Deno.env.get("ALERT_SECRET");

const PAGE_SIZE   = 1000;
const MAX_PER_RUN = 10000;   // whatever's left is picked up the next night
const REMOVE_CHUNK = 100;

interface Candidate { bucket_id: string; name: string; reason: string }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const incomingSecret = req.headers.get("x-alert-secret");
  if (!ALERT_SECRET || incomingSecret !== ALERT_SECRET) {
    console.warn("cleanup-media: rejected request with missing/invalid x-alert-secret");
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const counts: Record<string, number> = {};
  let deleted = 0;
  let failed = 0;

  if (dryRun) {
    const { data, error } = await admin.rpc("media_cleanup_candidates", { p_limit: 5000 });
    if (error) return json({ error: error.message }, 500);
    for (const c of (data ?? []) as Candidate[]) counts[c.reason] = (counts[c.reason] ?? 0) + 1;
    return json({ dry_run: true, would_delete: (data ?? []).length, by_reason: counts, sample: (data ?? []).slice(0, 20) });
  }

  while (deleted < MAX_PER_RUN) {
    const { data, error } = await admin.rpc("media_cleanup_candidates", { p_limit: PAGE_SIZE });
    if (error) {
      console.error("cleanup-media: listing candidates failed", error.message);
      return json({ error: error.message, deleted, by_reason: counts }, 500);
    }
    const candidates = (data ?? []) as Candidate[];
    if (candidates.length === 0) break;

    let removedThisPage = 0;
    const byBucket = new Map<string, Candidate[]>();
    for (const c of candidates) byBucket.set(c.bucket_id, [...(byBucket.get(c.bucket_id) ?? []), c]);

    for (const [bucket, items] of byBucket) {
      for (let i = 0; i < items.length; i += REMOVE_CHUNK) {
        const chunk = items.slice(i, i + REMOVE_CHUNK);
        const { data: removed, error: removeError } = await admin.storage.from(bucket).remove(chunk.map(c => c.name));
        if (removeError) {
          console.error(`cleanup-media: remove from ${bucket} failed`, removeError.message);
          failed += chunk.length;
          continue;
        }
        const removedNames = new Set((removed ?? []).map((o: { name: string }) => o.name));
        for (const c of chunk) {
          if (removedNames.has(c.name)) counts[c.reason] = (counts[c.reason] ?? 0) + 1;
        }
        removedThisPage += (removed ?? []).length;
      }
    }

    deleted += removedThisPage;
    // Nothing could be removed — stop rather than re-list the same page forever.
    if (removedThisPage === 0) break;
  }

  console.log(`cleanup-media: deleted ${deleted} file(s)`, counts, failed ? `${failed} failed` : "");
  return json({ deleted, failed, by_reason: counts });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
