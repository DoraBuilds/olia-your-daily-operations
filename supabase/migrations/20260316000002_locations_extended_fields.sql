-- ================================================================
-- Add extended fields to locations table
-- ================================================================
-- The application code uses contact_email, contact_phone,
-- trading_hours, and archive_threshold_days but the initial schema
-- only had alert_email, opening_time, closing_time,
-- and inactivity_threshold. This migration adds the expected columns.
--
-- Google Maps / Places fields (lat, lng, place_id) are added here
-- so Phase 2 (address autocomplete) works without a second migration.
-- ================================================================

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS contact_email       text,
  ADD COLUMN IF NOT EXISTS contact_phone       text,
  ADD COLUMN IF NOT EXISTS trading_hours       text,
  ADD COLUMN IF NOT EXISTS archive_threshold_days integer NOT NULL DEFAULT 90,
  -- Google Maps / Places API fields
  ADD COLUMN IF NOT EXISTS lat                 double precision,
  ADD COLUMN IF NOT EXISTS lng                 double precision,
  ADD COLUMN IF NOT EXISTS place_id            text;

-- ── Migrate existing data ─────────────────────────────────────────────────────
-- Copy legacy alert_email → contact_email where not yet set
UPDATE locations
SET    contact_email = alert_email
WHERE  contact_email IS NULL
  AND  alert_email   IS NOT NULL;

-- Copy legacy inactivity_threshold → archive_threshold_days where not yet set
UPDATE locations
SET    archive_threshold_days = inactivity_threshold
WHERE  inactivity_threshold IS NOT NULL
  AND  archive_threshold_days = 90;   -- only overwrite if still at default

-- Build trading_hours JSON from opening_time + closing_time where not yet set
-- Produces a WeeklyHours JSON with the same time applied Mon–Sat; Sun = closed.
UPDATE locations
SET    trading_hours = json_build_object(
         'mon', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'tue', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'wed', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'thu', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'fri', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'sat', json_build_object('open', true,  'start', COALESCE(opening_time, '08:00'), 'end', COALESCE(closing_time, '22:00')),
         'sun', json_build_object('open', false, 'start', '10:00',                          'end', '18:00')
       )::text
WHERE  trading_hours IS NULL
  AND  (opening_time IS NOT NULL OR closing_time IS NOT NULL);
