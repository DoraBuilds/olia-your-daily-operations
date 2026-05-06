-- ─── Server-side PIN brute-force rate limiting (SEQ-005) ─────────────────────
--
-- Problem:
--   Client-side PIN lockout (3 attempts → 30 s) can be bypassed by refreshing
--   the page or by calling validate_admin_pin / validate_staff_pin directly
--   via the Supabase REST API.  A 4-digit PIN (10 000 combinations) can be
--   exhausted in ~20 minutes with direct API calls.
--
-- Fix:
--   1. Add a pin_attempts table to track every PIN attempt per location.
--   2. Recreate validate_admin_pin with rate-limit logic:
--      – clean up old rows (> 1 hour) to keep the table lean
--      – count failed attempts in the last 5 minutes for this location + type
--      – if ≥ 10, raise an exception so the caller receives a clear error
--      – record every attempt (succeeded / failed) for auditing
--   3. Recreate validate_staff_pin with the same rate-limit wrapper.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: pin_attempts table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pin_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID        NOT NULL,
  pin_type     TEXT        NOT NULL CHECK (pin_type IN ('admin', 'staff')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded    BOOLEAN     NOT NULL DEFAULT false
);

-- Index for rate-limit lookups (location + time range)
CREATE INDEX IF NOT EXISTS pin_attempts_location_time_idx
  ON pin_attempts (location_id, attempted_at DESC);

-- RLS: table is managed exclusively by SECURITY DEFINER functions.
-- No direct client access is allowed.
ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;

-- Revoke all direct access; only SECURITY DEFINER functions can touch this table.
REVOKE ALL ON pin_attempts FROM anon, authenticated;

-- ── Step 2: validate_admin_pin with rate limiting ────────────────────────────
-- Recreates the function from 20260429000001 (bcrypt comparison) and wraps
-- the existing logic with the rate-limit guard and attempt recording.

DROP FUNCTION IF EXISTS public.validate_admin_pin(text, uuid);

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
SET search_path = public
AS $$
DECLARE
  v_recent_failures INT;
  v_matched         BOOLEAN := false;
  v_row             RECORD;
BEGIN
  -- Clean up stale attempts (> 1 hour) for this location to keep table lean
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  -- Count failed attempts in the last 5 minutes for this location + type
  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id = p_location_id
    AND pin_type    = 'admin'
    AND succeeded   = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  -- Rate limit: block after 10 consecutive failures within 5 minutes
  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Existing bcrypt validation logic (from 20260429000001) ───────────────
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

  -- Record the attempt
  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'admin', v_matched);

  -- Return the matched row (or empty set if no match)
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

-- ── Step 3: validate_staff_pin with rate limiting ────────────────────────────
-- Recreates the function from 20260320000002 (SHA-256 comparison) and wraps
-- the existing logic with the rate-limit guard and attempt recording.

DROP FUNCTION IF EXISTS public.validate_staff_pin(text, uuid);

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
SET search_path = public
AS $$
DECLARE
  v_recent_failures INT;
  v_matched         BOOLEAN := false;
  v_row             RECORD;
BEGIN
  -- Clean up stale attempts (> 1 hour) for this location to keep table lean
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  -- Count failed attempts in the last 5 minutes for this location + type
  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id = p_location_id
    AND pin_type    = 'staff'
    AND succeeded   = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  -- Rate limit: block after 10 consecutive failures within 5 minutes
  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Existing SHA-256 validation logic (from 20260320000002) ──────────────
  SELECT
    sp.id,
    sp.first_name,
    sp.last_name,
    sp.role,
    sp.organization_id
  INTO v_row
  FROM public.staff_profiles sp
  WHERE sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
    -- Match staff assigned to this specific location OR to all locations (NULL)
    AND (sp.location_id = p_location_id OR sp.location_id IS NULL)
    AND sp.status = 'active'
  -- Prefer exact-location match over all-locations match
  ORDER BY
    CASE WHEN sp.location_id = p_location_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  -- Record the attempt
  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'staff', v_matched);

  -- Return the matched row (or empty set if no match)
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
