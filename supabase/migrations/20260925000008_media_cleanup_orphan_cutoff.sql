-- ================================================================
-- Don't treat pre-fix logic-rule photos as orphans.
--
-- Until #933, answers to logic-rule follow-ups ("Photo required: …",
-- "Note required: …", follow-up questions) were shown on the kiosk but
-- never written to checklist_logs.answers. Their photos were uploaded,
-- so they look unreferenced, yet they're real evidence photos, not retakes.
-- Only photos uploaded after the fix shipped count as orphaned; older
-- unreferenced photos are left for the 2-year expiry like any other.
-- ================================================================

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
         AND c.created_at >= timestamptz '2026-09-26 00:00:00+00'
         AND NOT EXISTS (
           SELECT 1 FROM public.checklist_logs l
           WHERE l.answers @> jsonb_build_array(jsonb_build_object('answer', c.name))
         ))
  ORDER BY c.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

REVOKE ALL ON FUNCTION public.media_cleanup_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_cleanup_candidates(integer) TO service_role;
