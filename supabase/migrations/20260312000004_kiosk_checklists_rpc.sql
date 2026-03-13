-- ================================================================
-- KIOSK CHECKLISTS RPC
-- A SECURITY DEFINER function that the kiosk (anon key, no auth
-- session) can call to fetch checklists for a given location.
-- Returns only the fields required by the kiosk runner; no
-- sensitive data (org financials, staff PINs, etc.) is exposed.
-- ================================================================

CREATE OR REPLACE FUNCTION get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE(
  id         uuid,
  title      text,
  location_id uuid,
  sections   jsonb
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id,
      c.title,
      c.location_id,
      c.sections
    FROM checklists c
    WHERE c.location_id = p_location_id
    ORDER BY c.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to the anon and authenticated roles so both the
-- kiosk (anon) and manager sessions can call it.
GRANT EXECUTE ON FUNCTION get_kiosk_checklists(uuid) TO anon, authenticated;
