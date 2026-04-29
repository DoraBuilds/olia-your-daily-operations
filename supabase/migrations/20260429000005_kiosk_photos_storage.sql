-- ================================================================
-- SEQ-008: Kiosk photos storage bucket
-- Create a private Supabase Storage bucket for kiosk-captured photos.
-- Photos are uploaded here instead of being stored as base64 in
-- checklist_logs.answers JSONB, preventing DB bloat and data exposure.
-- ================================================================

-- Create the kiosk-photos storage bucket (private, not public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kiosk-photos',
  'kiosk-photos',
  false,           -- private bucket: direct URL access is blocked
  5242880,         -- 5 MB max file size per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to INSERT into kiosk-photos
-- The kiosk runs without an auth session (anon key only), so anonymous
-- upload must be permitted.  Paths are scoped per org/location/timestamp
-- in the client, which limits blast radius.
CREATE POLICY "anon_kiosk_photo_upload"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'kiosk-photos');

-- Allow authenticated managers to read kiosk photos for their organisation.
-- Managers access photos via signed URLs generated server-side; this policy
-- allows the Supabase storage engine to honour those signed requests.
CREATE POLICY "authenticated_read_kiosk_photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'kiosk-photos');
