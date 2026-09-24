-- ================================================================
-- Fast kiosk PIN checks (#865).
--
-- Problem:
--   validate_kiosk_member_pin and validate_admin_pin bcrypt-compare the
--   entered PIN against EVERY team member with a PIN
--   (crypt(p_pin, tm.pin) = tm.pin in a WHERE clause). PINs are bcrypt
--   cost 12 (~250ms each), so the check scales with team size. Since
--   #861 a paired kiosk runs signed out, i.e. as `anon`, whose
--   statement_timeout is 3s (authenticated had 8s, and old kiosks ran on
--   the owner's lingering session) — so on real locations these RPCs now
--   fail with 57014 "canceling statement due to statement timeout", which
--   the kiosk shows as "Connection error".
--
-- Fix:
--   team_members already carries pin_uniqueness_hash =
--   sha256(organization_id || raw PIN), unique per org and indexed
--   (20260521000001). _find_member_by_pin looks the candidate up by that
--   hash and bcrypt-verifies only that one row. Rows without a hash
--   (PINs set before that column, or re-hashed straight from the vault by
--   20260915000004) are backfilled here from pin_vault; any that remain
--   are still checked by a bcrypt scan limited to those legacy rows, and
--   get their hash filled in the first time they match.
--
--   Rate limiting, attempt logging and the returned columns of both RPCs
--   are unchanged.
-- ================================================================

-- ── 1. Backfill pin_uniqueness_hash from pin_vault ────────────────
-- Skips any (org, hash) that would collide — duplicate legacy PINs keep
-- working through the legacy scan in _find_member_by_pin.
WITH candidates AS (
  SELECT tm.id,
         tm.organization_id,
         encode(extensions.digest(tm.organization_id::text || pv.pin, 'sha256'), 'hex') AS hash
  FROM public.team_members tm
  JOIN public.pin_vault pv
    ON pv.member_type = 'team_member' AND pv.member_id = tm.id
  WHERE tm.pin IS NOT NULL
    AND tm.pin_uniqueness_hash IS NULL
),
unique_candidates AS (
  SELECT c.*
  FROM candidates c
  WHERE (SELECT count(*) FROM candidates c2
         WHERE c2.organization_id = c.organization_id AND c2.hash = c.hash) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.team_members existing
      WHERE existing.organization_id = c.organization_id
        AND existing.pin_uniqueness_hash = c.hash
    )
)
UPDATE public.team_members tm
SET pin_uniqueness_hash = uc.hash
FROM unique_candidates uc
WHERE tm.id = uc.id;

-- ── 2. _find_member_by_pin ────────────────────────────────────────
-- Internal helper (not granted to clients). Returns the matching team
-- member id in p_org_id, or NULL.
CREATE OR REPLACE FUNCTION public._find_member_by_pin(
  p_org_id     uuid,
  p_pin        text,
  p_owner_only boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_id   uuid;
  r      record;
BEGIN
  IF p_org_id IS NULL OR p_pin IS NULL OR p_pin = '' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(digest(p_org_id::text || p_pin, 'sha256'), 'hex');

  -- Fast path: indexed lookup, then one bcrypt verification.
  SELECT tm.id INTO v_id
  FROM public.team_members tm
  WHERE tm.organization_id = p_org_id
    AND tm.pin_uniqueness_hash = v_hash
    AND tm.pin IS NOT NULL
    AND (NOT p_owner_only OR tm.is_owner)
    AND crypt(p_pin, tm.pin) = tm.pin
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Legacy rows with no hash yet: bcrypt only those, one at a time.
  FOR r IN
    SELECT tm.id, tm.pin
    FROM public.team_members tm
    WHERE tm.organization_id = p_org_id
      AND tm.pin IS NOT NULL
      AND tm.pin_uniqueness_hash IS NULL
      AND (NOT p_owner_only OR tm.is_owner)
    ORDER BY tm.is_owner DESC, tm.created_at ASC
  LOOP
    IF crypt(p_pin, r.pin) = r.pin THEN
      BEGIN
        UPDATE public.team_members SET pin_uniqueness_hash = v_hash WHERE id = r.id;
      EXCEPTION WHEN unique_violation THEN
        NULL; -- another member in the org already has this PIN's hash
      END;
      RETURN r.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._find_member_by_pin(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ── 3. validate_kiosk_member_pin (latest: 20260918000002) ─────────
CREATE OR REPLACE FUNCTION public.validate_kiosk_member_pin(
  p_pin         text,
  p_location_id uuid
)
RETURNS TABLE (
  id              uuid,
  name            text,
  organization_id uuid,
  role            text,
  location_ids    uuid[],
  department_ids  uuid[]
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
  WHERE location_id  = p_location_id
    AND pin_type     = 'member'
    AND succeeded    = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT loc.organization_id INTO v_org_id FROM public.locations loc WHERE loc.id = p_location_id;
  v_member_id := public._find_member_by_pin(v_org_id, p_pin, false);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'member', v_member_id IS NOT NULL);

  IF v_member_id IS NOT NULL THEN
    RETURN QUERY
      SELECT tm.id, tm.name, tm.organization_id, tm.role,
             coalesce(tm.location_ids, '{}'), coalesce(tm.department_ids, '{}')
      FROM public.team_members tm
      WHERE tm.id = v_member_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_kiosk_member_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_kiosk_member_pin(text, uuid) TO anon, authenticated;

-- ── 4. validate_admin_pin (latest: 20260915000003) ────────────────
-- Owner-only, as before. Signed-in callers are still restricted to
-- their own org's locations.
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

  v_member_id := public._find_member_by_pin(v_org_id, p_pin, true);

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
