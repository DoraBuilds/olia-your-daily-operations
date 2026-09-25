-- ================================================================
-- Daily storage cleanup for kiosk photos and infohub files.
--
-- Nothing ever deleted files from storage, so three kinds piled up:
--
--   1. Expired photos — kiosk-photos older than 2 years. This is the
--      retention period promised in the Privacy Policy (§5). The log row
--      keeps its hasPhoto flag; only the image file goes.
--   2. Orphaned photos — uploaded by the kiosk but never saved in a
--      checklist log (retaken, removed, or the run was abandoned). The
--      kiosk is anonymous and can't delete (kiosk-photos only allows anon
--      INSERT, and anon DELETE would let anyone wipe any photo), so these
--      are swept here after a 2-day grace period instead.
--   3. Purged organisations' files — purge_expired_deleted_organizations
--      (20260918000003) deletes the org's rows but left its files behind,
--      even though the Terms promise all data is removed. Both buckets
--      store files under {organization_id}/..., so any file whose first
--      path segment no longer matches an organisation is swept.
--
-- Files must be removed through the Storage API (deleting storage.objects
-- rows in SQL leaves the underlying object behind), so this migration only
-- *lists* candidates; the cleanup-media edge function removes them. It's
-- triggered daily by pg_cron using the same app_config supabase_url /
-- alert_secret pair as run_checklist_alerts_sweep (20260916000001).
-- ================================================================

-- Photo answers are stored as {"answer": "<storage path>", ...} entries in
-- checklist_logs.answers; this makes the orphan check's containment lookup
-- an index probe instead of a scan of every log.
CREATE INDEX IF NOT EXISTS checklist_logs_answers_gin
  ON public.checklist_logs USING gin (answers jsonb_path_ops);

CREATE OR REPLACE FUNCTION public.media_cleanup_candidates(p_limit integer DEFAULT 1000)
RETURNS TABLE (bucket_id text, name text, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  WITH files AS (
    SELECT o.bucket_id, o.name, o.created_at,
           split_part(o.name, '/', 1) AS org_segment
    FROM storage.objects o
    WHERE o.bucket_id IN ('kiosk-photos', 'infohub-files')
  ),
  classified AS (
    SELECT f.*,
           (f.org_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id::text = lower(f.org_segment))
           ) AS org_gone
    FROM files f
  )
  SELECT c.bucket_id::text, c.name::text,
         CASE
           WHEN c.org_gone THEN 'organization_deleted'
           WHEN c.created_at < now() - interval '2 years' THEN 'expired'
           ELSE 'orphaned'
         END AS reason
  FROM classified c
  WHERE c.org_gone
     OR (c.bucket_id = 'kiosk-photos' AND c.created_at < now() - interval '2 years')
     OR (c.bucket_id = 'kiosk-photos'
         AND c.created_at < now() - interval '2 days'
         AND NOT EXISTS (
           SELECT 1 FROM public.checklist_logs l
           WHERE l.answers @> jsonb_build_array(jsonb_build_object('answer', c.name))
         ))
  ORDER BY c.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

REVOKE ALL ON FUNCTION public.media_cleanup_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_cleanup_candidates(integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_media_cleanup_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url    text;
  _secret text;
BEGIN
  SELECT value INTO _url    FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _secret FROM public.app_config WHERE key = 'alert_secret';

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'run_media_cleanup_sweep: supabase_url not set in app_config table.';
    RETURN;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'run_media_cleanup_sweep: alert_secret not set in app_config table.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/cleanup-media',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-alert-secret', _secret
               ),
    body    := jsonb_build_object('cron', true),
    timeout_milliseconds := 60000
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_media_cleanup_sweep: pg_net call failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.run_media_cleanup_sweep() FROM PUBLIC, anon, authenticated;

-- Re-runnable: drop any existing job with this name before scheduling.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-media-daily';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 04:15 UTC — after the 03:30 org purge, so a just-purged org's files go the same night.
SELECT cron.schedule(
  'cleanup-media-daily',
  '15 4 * * *',
  $$SELECT public.run_media_cleanup_sweep();$$
);
