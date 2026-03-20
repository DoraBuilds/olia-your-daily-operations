-- ================================================================
-- Migration: kiosk due_time + visibility fixes
-- ================================================================
-- Changes:
--   1. Add due_time column to checklists (TIME WITHOUT TIME ZONE, nullable)
--   2. Recreate get_kiosk_checklists RPC:
--        - returns checklists for a given location OR "All locations" (IS NULL)
--        - no time_of_day filtering — visibility is handled client-side
--        - returns due_time so the kiosk can compute DUE vs UPCOMING
--   3. Add RLS policy so the anon role can SELECT from locations
--        (required for kiosk setup screen to load real locations)
-- ================================================================


-- ----------------------------------------------------------------
-- 1. due_time column
--    Stores the time of day when the checklist is due (e.g. 09:00).
--    Nullable: existing checklists without a due time are always shown.
--    If the column was previously created as TEXT (text), we migrate it
--    to the proper TIME type.
-- ----------------------------------------------------------------

DO $$
DECLARE
  col_type text;
BEGIN
  -- Check whether the column already exists and what type it has
  SELECT data_type
    INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'checklists'
     AND column_name  = 'due_time';

  IF col_type IS NULL THEN
    -- Column does not exist yet — add it with the correct type
    EXECUTE 'ALTER TABLE public.checklists
               ADD COLUMN due_time TIME WITHOUT TIME ZONE';

  ELSIF col_type = 'text' THEN
    -- Column exists as text (older migration) — cast to TIME in-place.
    -- Rows with NULL or invalid text become NULL (safe).
    EXECUTE 'ALTER TABLE public.checklists
               ALTER COLUMN due_time TYPE TIME WITHOUT TIME ZONE
               USING CASE
                       WHEN due_time ~ ''^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$''
                       THEN due_time::time
                       ELSE NULL
                     END';

  -- If already TIME WITHOUT TIME ZONE, nothing to do
  END IF;
END $$;


-- ----------------------------------------------------------------
-- 2. get_kiosk_checklists RPC
--    Replaces all previous versions of this function.
--    Visibility filtering (1 h before due time, DUE vs UPCOMING)
--    is intentionally left to the client — the RPC simply returns
--    everything the kiosk is entitled to see for a given location.
-- ----------------------------------------------------------------

-- Drop all known previous signatures before re-creating
DROP FUNCTION IF EXISTS public.get_kiosk_checklists(uuid);

CREATE OR REPLACE FUNCTION public.get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE (
  id          uuid,
  title       text,
  location_id uuid,
  time_of_day text,         -- kept for backward compat; client ignores it
  due_time    text,         -- returned as HH:MM string so JS can parse directly
  sections    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the function owner, bypasses RLS on checklists
STABLE             -- safe to cache within a transaction
AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id,
      c.title,
      c.location_id,
      c.time_of_day,
      -- Cast TIME → text in HH:MM format so the JS frontend receives a
      -- plain string it can split on ':' without further conversion.
      to_char(c.due_time, 'HH24:MI')  AS due_time,
      c.sections
    FROM public.checklists c
    WHERE
      c.location_id = p_location_id   -- assigned to this specific location
      OR c.location_id IS NULL        -- OR assigned to "All locations"
    ORDER BY
      -- Nulls (no due time) sort last within each location group
      c.due_time ASC NULLS LAST,
      c.title    ASC;
END;
$$;

-- Grant execute to the roles the kiosk uses (anon = unauthenticated kiosk,
-- authenticated = logged-in admin viewing the kiosk preview)
GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid) TO anon, authenticated;


-- ----------------------------------------------------------------
-- 3. RLS: allow anon to SELECT from locations
--    The kiosk setup screen queries the locations table directly
--    (without going through the RPC) so it can populate the
--    location picker.  Without this policy the query returns an
--    empty set and the kiosk falls back to hard-coded mock IDs.
-- ----------------------------------------------------------------

-- Ensure RLS is enabled on locations (no-op if already enabled)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'locations'
       AND policyname = 'anon_read_locations'
  ) THEN
    CREATE POLICY anon_read_locations
      ON public.locations
      FOR SELECT
      TO anon
      USING (true);     -- read-only; all rows visible to anon
  END IF;
END $$;
