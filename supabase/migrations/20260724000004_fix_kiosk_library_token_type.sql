-- Fix: get_kiosk_library used text for p_kiosk_token but locations.kiosk_token is uuid.
-- PostgreSQL has no implicit uuid=text operator so the function threw "operator does not exist".

DROP FUNCTION IF EXISTS public.get_kiosk_library(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.get_kiosk_library(
  p_location_id    uuid,
  p_team_member_id uuid,
  p_kiosk_token    uuid
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
        jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id) ORDER BY f.name),
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
          jsonb_build_object('id', d.id, 'title', d.title, 'summary', d.summary, 'body', d.body, 'folder_id', d.folder_id, 'metadata', coalesce(d.metadata, '{}'::jsonb))
          ORDER BY d.title
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
