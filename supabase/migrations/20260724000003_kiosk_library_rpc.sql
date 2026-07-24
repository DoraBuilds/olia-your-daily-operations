-- ================================================================
-- Kiosk library access
--
-- 1. Update validate_kiosk_member_pin to also return role and
--    location_ids so the library PIN modal can build an access
--    principal for content filtering.
--
-- 2. Add get_kiosk_library RPC — callable by anon — which returns
--    the infohub library folders and documents visible to a given
--    team member. Passing NULL for p_team_member_id (staff profile
--    PIN holders) limits results to org-wide items only.
-- ================================================================

-- 1. Update validate_kiosk_member_pin to return role + location_ids.
-- Must DROP first: Postgres disallows OR REPLACE when the return type changes.
DROP FUNCTION IF EXISTS public.validate_kiosk_member_pin(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_kiosk_member_pin(
  p_pin         text,
  p_location_id uuid
)
RETURNS TABLE (
  id              uuid,
  name            text,
  organization_id uuid,
  role            text,
  location_ids    uuid[]
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
  WHERE location_id  = p_location_id
    AND pin_type     = 'member'
    AND succeeded    = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    tm.id,
    tm.name,
    tm.organization_id,
    tm.role,
    coalesce(tm.location_ids, '{}') AS location_ids
  INTO v_row
  FROM public.locations loc
  JOIN public.team_members tm
    ON tm.organization_id = loc.organization_id
  WHERE loc.id = p_location_id
    AND tm.pin IS NOT NULL
    AND crypt(p_pin, tm.pin) = tm.pin
  ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
  LIMIT 1;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'member', v_matched);

  IF v_matched THEN
    RETURN QUERY SELECT v_row.id, v_row.name, v_row.organization_id, v_row.role, v_row.location_ids;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_kiosk_member_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_kiosk_member_pin(text, uuid) TO anon, authenticated;

-- 2. get_kiosk_library
-- Drop the text-parameter variant first; kiosk_token column is UUID not text.
DROP FUNCTION IF EXISTS public.get_kiosk_library(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.get_kiosk_library(
  p_location_id    uuid,
  p_team_member_id uuid,   -- null means staff-profile PIN: org-wide items only
  p_kiosk_token    uuid    -- server-issued device token; required for non-empty response
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_role        text;
  v_member_lids uuid[];
  v_is_owner    boolean := false;
BEGIN
  -- Verify the kiosk_token server-side so callers cannot supply arbitrary
  -- p_team_member_id values without proof of a valid kiosk device.
  IF p_kiosk_token IS NULL THEN
    RETURN '{"folders":[],"documents":[]}'::jsonb;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM locations
  WHERE id = p_location_id
    AND kiosk_token = p_kiosk_token;

  IF v_org_id IS NULL THEN
    RETURN '{"folders":[],"documents":[]}'::jsonb;
  END IF;

  IF p_team_member_id IS NOT NULL THEN
    SELECT tm.role, coalesce(tm.location_ids, '{}')
    INTO v_role, v_member_lids
    FROM team_members tm
    WHERE tm.id = p_team_member_id
      AND tm.organization_id = v_org_id;

    v_is_owner := (v_role = 'Owner');
  END IF;

  RETURN jsonb_build_object(
    'folders', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id)
          ORDER BY f.name
        ),
        '[]'::jsonb
      )
      FROM infohub_folders f
      WHERE f.organization_id = v_org_id
        AND f.section = 'library'
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && f.allowed_location_ids)
        )
    ),
    'documents', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'title', d.title,
            'summary', d.summary,
            'body', d.body,
            'folder_id', d.folder_id,
            'metadata', coalesce(d.metadata, '{}'::jsonb)
          ) ORDER BY d.title
        ),
        '[]'::jsonb
      )
      FROM infohub_documents d
      JOIN infohub_folders f ON f.id = d.folder_id
      WHERE d.organization_id = v_org_id
        AND d.section = 'library'
        AND d.archived_at IS NULL
        AND (
          v_is_owner
          OR d.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(d.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(d.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && d.allowed_location_ids)
        )
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && f.allowed_location_ids)
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kiosk_library(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_library(uuid, uuid, uuid) TO anon, authenticated;
