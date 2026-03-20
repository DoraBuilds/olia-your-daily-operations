-- ================================================================
-- Add due_time column to checklists + fix get_kiosk_checklists:
--   1. Expose due_time so kiosk can show DUE vs UPCOMING
--   2. Include "All locations" (location_id IS NULL) in every kiosk
--   3. Grant anon SELECT on locations so kiosk setup can read real locations
-- ================================================================

-- 1. Add due_time column (HH:MM string, e.g. "09:00")
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS due_time text;

-- 2. Rebuild get_kiosk_checklists
DROP FUNCTION IF EXISTS get_kiosk_checklists(uuid);
CREATE OR REPLACE FUNCTION get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE(
  id          uuid,
  title       text,
  location_id uuid,
  time_of_day text,
  due_time    text,
  sections    jsonb
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id,
      c.title,
      c.location_id,
      c.time_of_day,
      c.due_time,
      c.sections
    FROM checklists c
    WHERE
      c.location_id = p_location_id   -- assigned to this location
      OR c.location_id IS NULL        -- OR assigned to "All locations"
    ORDER BY
      COALESCE(c.due_time, '23:59'),  -- sort by due time, nulls last
      c.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_kiosk_checklists(uuid) TO anon, authenticated;

-- 3. Allow anon users to read locations (needed by kiosk setup screen)
--    Skip if the policy already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'locations'
      AND policyname = 'anon_read_locations'
  ) THEN
    -- Make sure RLS is enabled on locations first
    ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

    CREATE POLICY anon_read_locations ON locations
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
