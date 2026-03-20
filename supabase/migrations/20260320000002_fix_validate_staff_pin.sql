-- ================================================================
-- Migration: fix validate_staff_pin to match all-location staff
-- ================================================================
-- Problem: the previous version required an EXACT location_id match.
-- Staff profiles with location_id IS NULL (assigned to "All locations")
-- could never authenticate on any kiosk because NULL = uuid is never TRUE.
--
-- Fix: broaden the WHERE clause so that staff assigned to the specific
-- location OR to "All locations" (IS NULL) are both accepted.
--
-- Also: drop any duplicate function signatures that may exist from
-- earlier migrations to avoid "function already exists" errors.
-- ================================================================

-- Ensure pgcrypto is available (no-op if already installed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop all known previous signatures before re-creating
DROP FUNCTION IF EXISTS public.validate_staff_pin(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_staff_pin(p_pin text, p_location_id uuid)
RETURNS TABLE(
  id              uuid,
  first_name      text,
  last_name       text,
  role            text,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as function owner; bypasses RLS on staff_profiles
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      sp.id,
      sp.first_name,
      sp.last_name,
      sp.role,
      sp.organization_id
    FROM public.staff_profiles sp
    WHERE
      sp.pin    = encode(digest(p_pin, 'sha256'), 'hex')
      -- Match staff assigned to this specific location OR to all locations (NULL)
      AND (sp.location_id = p_location_id OR sp.location_id IS NULL)
      AND sp.status = 'active'
    -- Prefer exact-location match over all-locations match
    ORDER BY
      CASE WHEN sp.location_id = p_location_id THEN 0 ELSE 1 END
    LIMIT 1;
END;
$$;

-- Grant execute to anon (kiosk) and authenticated (admin preview)
GRANT EXECUTE ON FUNCTION public.validate_staff_pin(text, uuid) TO anon, authenticated;
