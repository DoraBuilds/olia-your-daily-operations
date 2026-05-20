-- ================================================================
-- Fix: add `extensions` to search_path for PIN validation functions.
--
-- Problem:
--   validate_admin_pin, validate_staff_pin, and set_admin_pin were
--   defined with SET search_path = public only.  pgcrypto (crypt,
--   gen_salt, digest) lives in the `extensions` schema on this
--   Supabase project, so any call to these functions threw
--   "function crypt(text,text) does not exist", which surfaced as
--   "Connection error. Check your network and try again." at the kiosk.
--
--   setup_new_organization (20260508000001) was already correctly
--   written with SET search_path = public, extensions — this migration
--   brings the remaining PIN functions into line with that pattern.
-- ================================================================

-- ── 1. validate_admin_pin ─────────────────────────────────────────

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
  -- Clean up stale attempts (> 1 hour) for this location
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  -- Count failed attempts in the last 5 minutes
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
      tm.id,
      tm.organization_id,
      tm.name,
      tm.email,
      tm.role,
      tm.location_ids,
      tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND target.organization_id = public.current_org_id()
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND (
       tm.role = 'Owner'
       OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
     )
   ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
   LIMIT 1;
  ELSE
    SELECT
      tm.id,
      tm.organization_id,
      tm.name,
      tm.email,
      tm.role,
      tm.location_ids,
      tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND (
       tm.role = 'Owner'
       OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
     )
   ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
   LIMIT 1;
  END IF;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'admin', v_matched);

  IF v_matched THEN
    RETURN QUERY
      SELECT
        v_row.id,
        v_row.organization_id,
        v_row.name,
        v_row.email,
        v_row.role,
        v_row.location_ids,
        v_row.permissions;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;

-- ── 2. validate_staff_pin ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_staff_pin(p_pin text, p_location_id uuid)
RETURNS TABLE (
  id              uuid,
  first_name      text,
  last_name       text,
  role            text,
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
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id = p_location_id
    AND pin_type    = 'staff'
    AND succeeded   = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    sp.id,
    sp.first_name,
    sp.last_name,
    sp.role,
    sp.organization_id
  INTO v_row
  FROM public.staff_profiles sp
  WHERE sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
    AND (sp.location_id = p_location_id OR sp.location_id IS NULL)
    AND sp.status = 'active'
  ORDER BY
    CASE WHEN sp.location_id = p_location_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'staff', v_matched);

  IF v_matched THEN
    RETURN QUERY
      SELECT
        v_row.id,
        v_row.first_name,
        v_row.last_name,
        v_row.role,
        v_row.organization_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_staff_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_staff_pin(text, uuid) TO anon, authenticated;

-- ── 3. set_admin_pin ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_admin_pin(
  p_member_id uuid,
  p_raw_pin   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_member_id THEN
    RAISE EXCEPTION 'You may only update your own PIN';
  END IF;

  IF length(trim(p_raw_pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.team_members
  WHERE id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Team member not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = v_org_id
      AND tm.id <> p_member_id
      AND tm.pin IS NOT NULL
      AND crypt(p_raw_pin, tm.pin) = tm.pin
  ) THEN
    RAISE EXCEPTION 'Another team member is already using this PIN. Please choose a different one.';
  END IF;

  UPDATE public.team_members
  SET
    pin               = crypt(p_raw_pin, gen_salt('bf', 12)),
    default_pin       = NULL,
    pin_reset_required = false
  WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(uuid, text) TO authenticated;
