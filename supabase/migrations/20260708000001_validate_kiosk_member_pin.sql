-- ================================================================
-- Add validate_kiosk_member_pin for checklist PIN entry.
--
-- Problem:
--   PinEntryModal (checklist start flow) was calling validate_admin_pin,
--   which requires team members to have the kiosk location in location_ids.
--   Team members added via "Add team member" default to empty location_ids,
--   so their kiosk PINs silently fail even though the UI implies they work.
--
-- Solution:
--   New validate_kiosk_member_pin checks any team member belonging to the
--   kiosk's organisation — no location_ids restriction. Checklist access is
--   already scoped to the physical kiosk's location; the location_ids guard
--   is only relevant for admin-panel access (validate_admin_pin unchanged).
--
--   validate_admin_pin remains strict (location + role check) and is still
--   used by AdminLoginModal which grants full admin-panel access.
-- ================================================================

CREATE OR REPLACE FUNCTION public.validate_kiosk_member_pin(
  p_pin        text,
  p_location_id uuid
)
RETURNS TABLE (
  id              uuid,
  name            text,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recent_failures INT;
  v_matched         BOOLEAN := false;
  v_row             RECORD;
BEGIN
  -- Clean up stale attempts (> 1 hour)
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  -- Rate-limit: block after 10 failures in 5 minutes
  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id  = p_location_id
    AND pin_type     = 'member'
    AND succeeded    = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Match any team member in the same org as the kiosk location.
  -- No location_ids check: physical presence at the kiosk is sufficient
  -- for checklist access (distinct from admin-panel access).
  SELECT
    tm.id,
    tm.name,
    tm.organization_id
  INTO v_row
  FROM public.locations loc
  JOIN public.team_members tm
    ON tm.organization_id = loc.organization_id
  WHERE loc.id = p_location_id
    AND tm.pin IS NOT NULL
    AND crypt(p_pin, tm.pin) = tm.pin
  ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
  LIMIT 1;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'member', v_matched);

  IF v_matched THEN
    RETURN QUERY SELECT v_row.id, v_row.name, v_row.organization_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_kiosk_member_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_kiosk_member_pin(text, uuid) TO anon, authenticated;
