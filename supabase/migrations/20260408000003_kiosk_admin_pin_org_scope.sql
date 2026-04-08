-- ================================================================
-- Harden kiosk admin PIN validation to the selected location org.
--
-- Problem:
--   validate_admin_pin matched Owner rows globally by PIN, even if the
--   selected kiosk location belonged to a different organization.
--
-- This migration scopes the match through the selected location so the
-- kiosk admin PIN can only unlock admin for the same organization as the
-- kiosk location being viewed.
-- ================================================================

DROP FUNCTION IF EXISTS public.validate_admin_pin(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_admin_pin(p_pin text, p_location_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  email text,
  role text,
  location_ids uuid[],
  permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN QUERY
      SELECT
        tm.id,
        tm.organization_id,
        tm.name,
        tm.email,
        tm.role,
        tm.location_ids,
        tm.permissions
      FROM public.locations target
      JOIN public.team_members tm
        ON tm.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND tm.pin = encode(digest(p_pin, 'sha256'), 'hex')
       AND (
         tm.role = 'Owner'
         OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
       )
     ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
     LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT
        tm.id,
        tm.organization_id,
        tm.name,
        tm.email,
        tm.role,
        tm.location_ids,
        tm.permissions
      FROM public.locations target
      JOIN public.team_members tm
        ON tm.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND tm.pin = encode(digest(p_pin, 'sha256'), 'hex')
       AND (
         tm.role = 'Owner'
         OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
       )
     ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
     LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;
