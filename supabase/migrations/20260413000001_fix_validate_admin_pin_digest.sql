-- ================================================================
-- Fix validate_admin_pin digest lookup on hosted Supabase.
--
-- Problem:
--   validate_admin_pin sets search_path = public, which excludes the
--   extensions schema on hosted Supabase. Calling digest(...) then fails
--   at runtime with:
--     function digest(text, unknown) does not exist
--
-- Fix:
--   schema-qualify digest() through extensions.digest().
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
       AND tm.pin = encode(extensions.digest(p_pin, 'sha256'), 'hex')
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
       AND tm.pin = encode(extensions.digest(p_pin, 'sha256'), 'hex')
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
