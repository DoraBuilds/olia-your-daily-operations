-- ================================================================
-- Add time_of_day column to checklists table and update the
-- kiosk RPC to return it so the kiosk can filter checklists
-- by time of day.
-- ================================================================

-- Add column (nullable, defaults to 'anytime')
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS time_of_day text NOT NULL DEFAULT 'anytime'
  CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'anytime'));

-- Drop old version first so we can change the return type (adding time_of_day column)
DROP FUNCTION IF EXISTS get_kiosk_checklists(uuid);

-- Update the kiosk RPC to include time_of_day
CREATE OR REPLACE FUNCTION get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE(
  id          uuid,
  title       text,
  location_id uuid,
  time_of_day text,
  sections    jsonb
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id,
      c.title,
      c.location_id,
      c.time_of_day,
      c.sections
    FROM checklists c
    WHERE c.location_id = p_location_id
    ORDER BY c.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_kiosk_checklists(uuid) TO anon, authenticated;
