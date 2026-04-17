-- ─── Switch admin PINs from SHA-256 hashes to plain text ─────────────────────
--
-- Previously, team_members.pin stored a SHA-256 hex digest and
-- validate_admin_pin() re-hashed the incoming PIN server-side before
-- comparing. This made it impossible to display the current PIN to the owner.
--
-- New approach: store the raw 4-digit PIN as plain text. The PIN is only used
-- for kiosk access (not auth), so plain text is an acceptable trade-off for
-- usability.
--
-- Existing rows have hashed PINs that cannot be reversed. We set
-- pin_reset_required = true for all of them so owners are prompted to set a
-- new (plain-text) PIN on next login.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Force PIN reset for all team members whose pin looks like a SHA-256 hash
--    (64-char hex string). This ensures they set a new plain-text PIN.
UPDATE public.team_members
SET pin_reset_required = true
WHERE length(pin) = 64
  AND pin ~ '^[0-9a-f]{64}$';

-- 2. Update validate_admin_pin to compare the raw PIN directly (no hashing).
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
       AND tm.pin = p_pin
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
       AND tm.pin = p_pin
       AND (
         tm.role = 'Owner'
         OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
       )
     ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
     LIMIT 1;
  END IF;
END;
$$;
