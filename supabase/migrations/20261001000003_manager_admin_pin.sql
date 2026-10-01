-- ================================================================
-- Managers can open Admin from the kiosk with their own PIN (#984).
--
-- Problem:
--   validate_admin_pin has been owner-only since 20260708000003, so a
--   manager's PIN came back "invalid" even though managers have admin
--   access (is_manager + permissions, scoped to their locations).
--   kiosk_admin_pin_login also INNER JOINed auth.users, so a manager who
--   hasn't accepted their invite yet looked like a wrong PIN.
--
-- Fix:
--   1. validate_admin_pin accepts the owner, or a manager (is_manager)
--      who is assigned to the kiosk's location. Kiosk-only members
--      (is_manager = false) stay locked out. Same rate limit, attempt
--      log and columns as before.
--   2. kiosk_admin_pin_login LEFT JOINs auth.users so a manager with no
--      login yet returns a row with a null email; the edge function
--      already turns that into "no_login".
-- ================================================================

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
  v_org_id          uuid;
  v_member_id       uuid;
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

  SELECT loc.organization_id INTO v_org_id
  FROM public.locations loc
  WHERE loc.id = p_location_id
    AND (coalesce(auth.role(), '') <> 'authenticated' OR loc.organization_id = public.current_org_id());

  -- PINs are unique per org, so this finds at most one member; then check
  -- they're allowed into Admin from THIS kiosk.
  v_member_id := public._find_member_by_pin(v_org_id, p_pin, false);

  IF v_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = v_member_id
      AND (
        tm.is_owner
        OR (tm.is_manager AND p_location_id = ANY(coalesce(tm.location_ids, '{}')))
      )
  ) THEN
    v_member_id := NULL;
  END IF;

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'admin', v_member_id IS NOT NULL);

  IF v_member_id IS NOT NULL THEN
    RETURN QUERY
      SELECT tm.id, tm.organization_id, tm.name, tm.email,
             tm.role, tm.location_ids, tm.permissions
      FROM public.team_members tm
      WHERE tm.id = v_member_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kiosk_admin_pin_login(
  p_device_token uuid,
  p_pin text
)
RETURNS TABLE (
  team_member_id uuid,
  auth_user_id uuid,
  email text,
  location_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _location_id uuid;
  _member_id uuid;
BEGIN
  SELECT d.location_id INTO _location_id
  FROM public.kiosk_devices d
  WHERE d.device_token = p_device_token
    AND d.paired_at IS NOT NULL
    AND d.revoked_at IS NULL;

  IF _location_id IS NULL THEN
    RAISE EXCEPTION 'kiosk_device_inactive';
  END IF;

  SELECT v.id INTO _member_id
  FROM public.validate_admin_pin(p_pin, _location_id) v
  LIMIT 1;

  IF _member_id IS NULL THEN
    RETURN;
  END IF;

  -- LEFT JOIN: a manager who hasn't accepted their invite has no auth
  -- user yet; return the row with a null email so the edge function can
  -- say "no_login" instead of "invalid PIN".
  RETURN QUERY
    SELECT tm.id, u.id, u.email::text, _location_id
    FROM public.team_members tm
    LEFT JOIN auth.users u ON u.id = coalesce(tm.auth_user_id, tm.id)
    WHERE tm.id = _member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kiosk_admin_pin_login(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_admin_pin_login(uuid, text) TO service_role;
