-- ================================================================
-- Scope kiosk photo reads to the reader's own organisation.
--
-- authenticated_read_kiosk_photos (20260429000005) only checked the
-- bucket, so any signed-in user of any organisation could list the whole
-- kiosk-photos bucket and sign/download every other organisation's
-- checklist photos. Photos are stored as {organization_id}/{location_id}/…,
-- so restrict SELECT to the caller's own org folder — the same rule
-- infohub-files already uses (infohub_file_read_own_org, 20260715000001).
--
-- Only affects signed-in users. The anonymous kiosk had no SELECT and
-- still doesn't; the cleanup-media sweep uses the service role.
-- ================================================================

DROP POLICY IF EXISTS "authenticated_read_kiosk_photos" ON storage.objects;
DROP POLICY IF EXISTS "kiosk_photos_read_own_org" ON storage.objects;

CREATE POLICY "kiosk_photos_read_own_org"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kiosk-photos'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );
