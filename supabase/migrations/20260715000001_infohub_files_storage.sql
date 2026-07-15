-- Create private storage bucket for infohub document file uploads.
-- Files are stored under {org_id}/{timestamp}.{ext} to scope by organisation.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'infohub-files',
  'infohub-files',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Files are stored as {org_id}/{timestamp}.{ext}. All three policies enforce that
-- the path's first segment matches the caller's organisation, preventing cross-tenant
-- read, write, and delete (IDOR).

CREATE POLICY "infohub_file_upload_own_org"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "infohub_file_read_own_org"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "infohub_file_delete_own_org"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
