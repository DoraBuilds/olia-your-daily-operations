-- Restrict validate_admin_pin to Owner role only.
--
-- Previously the function also accepted Manager PINs when the manager had
-- the kiosk location in their location_ids. Since we now use
-- validate_kiosk_member_pin for checklist access (any org member),
-- validate_admin_pin is only called by AdminLoginModal which should
-- grant full admin-panel access to Owners only.
--
-- Removing the OR p_location_id = ANY(location_ids) clause means only
-- the Owner's PIN can open the admin panel from the kiosk.

CREATE OR REPLACE FUNCTION public.validate_admin_pin(p_pin text, p_location_id uuid)
RETURNS TABLE (
  id              uuid,
  organization_id uuid,
  name            text,
  email           text,
  role            text,
  location_ids    uuid[],
  permissions     jsonb
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
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id = p_location_id
    AND pin_type    = 'admin'
    AND succeeded   = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF auth.role() = 'authenticated' THEN
    SELECT
      tm.id, tm.organization_id, tm.name, tm.email,
      tm.role, tm.location_ids, tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND target.organization_id = public.current_org_id()
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND tm.role = 'Owner'
   LIMIT 1;
  ELSE
    SELECT
      tm.id, tm.organization_id, tm.name, tm.email,
      tm.role, tm.location_ids, tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND tm.role = 'Owner'
   LIMIT 1;
  END IF;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'admin', v_matched);

  IF v_matched THEN
    RETURN QUERY SELECT
      v_row.id, v_row.organization_id, v_row.name, v_row.email,
      v_row.role, v_row.location_ids, v_row.permissions;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;
