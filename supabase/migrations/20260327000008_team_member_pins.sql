-- ============================================================
-- TEAM MEMBER PINS
-- Add a kiosk/admin PIN field for team members and a safe PIN
-- validator so kiosk admin access can use PIN-only authentication.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS pin text;

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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      tm.id,
      tm.organization_id,
      tm.name,
      tm.email,
      tm.role,
      tm.location_ids,
      tm.permissions
    FROM public.team_members tm
    WHERE tm.pin = encode(digest(p_pin, 'sha256'), 'hex')
      AND (
        tm.role = 'Owner'
        OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
      )
    ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;
