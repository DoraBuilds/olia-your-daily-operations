-- Training completion report (#915).
--
-- 1. Owners, and managers with the View reporting permission, can read
--    every team member's training progress in their company (staff still
--    only see their own — the existing training_progress_select policy).
-- 2. "Every location" fix: a team member with no specific locations
--    (empty location_ids = every location) now matches Info Hub content
--    shared by location. Previously only members with that exact location
--    picked matched — in the web Info Hub (infohub_scope_allows), the kiosk
--    Infohub (get_kiosk_library) and kiosk completion
--    (set_kiosk_training_complete). Bodies are otherwise unchanged from
--    20260915000003 / 20260925000002 / 20260925000003.
-- 3. infohub_scope_allows also recognises members who log in through an
--    accepted invite (auth_user_id), matching current_org_id(); before,
--    only members whose id equals their login id matched restricted content.

-- ── 1. Reporting read access to training progress ─────────────────
CREATE OR REPLACE FUNCTION public.can_view_org_reporting(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
      AND tm.organization_id = p_org_id
      AND (
        tm.is_owner
        OR (tm.is_manager AND COALESCE((tm.permissions->>'view_reporting')::boolean, false))
      )
  );
$$;

DROP POLICY IF EXISTS training_progress_select_reporting ON public.training_progress;
CREATE POLICY training_progress_select_reporting ON public.training_progress FOR SELECT
  USING (organization_id = current_org_id() AND can_view_org_reporting(organization_id));

-- ── 2a. Web Info Hub sharing rule ─────────────────────────────────
CREATE OR REPLACE FUNCTION infohub_scope_allows(
  p_org_id uuid,
  p_access_scope infohub_access_scope,
  p_allowed_team_member_ids uuid[],
  p_allowed_roles text[],
  p_allowed_location_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_org_id = current_org_id()
    AND (
      p_access_scope = 'org'
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
          AND tm.organization_id = p_org_id
          AND (
            tm.is_owner
            OR tm.id = ANY(COALESCE(p_allowed_team_member_ids, '{}'::uuid[]))
            OR tm.role = ANY(COALESCE(p_allowed_roles, '{}'::text[]))
            OR CASE WHEN COALESCE(tm.location_ids, '{}') = '{}'
              THEN COALESCE(array_length(p_allowed_location_ids, 1), 0) > 0
              ELSE COALESCE(tm.location_ids && COALESCE(p_allowed_location_ids, '{}'::uuid[]), false) END
          )
      )
    );
$$;

-- ── 2b. Kiosk Infohub ─────────────────────────────────────────────
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
    SELECT tm.role, tm.is_owner, coalesce(tm.location_ids, '{}')
    INTO v_role, v_is_owner, v_member_lids
    FROM team_members tm
    WHERE tm.id = p_team_member_id
      AND tm.organization_id = v_org_id;
  END IF;
  v_is_owner := coalesce(v_is_owner, false);

  RETURN jsonb_build_object(
    'folders', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id, 'section', f.section)
          ORDER BY f.name
        ),
        '[]'::jsonb
      )
      FROM infohub_folders f
      WHERE f.organization_id = v_org_id
        AND f.section IN ('library', 'training')
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND CASE WHEN v_member_lids = '{}' THEN coalesce(array_length(f.allowed_location_ids, 1), 0) > 0 ELSE v_member_lids && f.allowed_location_ids END)
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
            'section', d.section,
            'metadata', coalesce(d.metadata, '{}'::jsonb)
          ) ORDER BY d.title
        ),
        '[]'::jsonb
      )
      FROM infohub_documents d
      JOIN infohub_folders f ON f.id = d.folder_id
      WHERE d.organization_id = v_org_id
        AND d.section IN ('library', 'training')
        AND d.archived_at IS NULL
        AND (
          v_is_owner
          OR d.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(d.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(d.allowed_roles))
          OR (v_member_lids IS NOT NULL AND CASE WHEN v_member_lids = '{}' THEN coalesce(array_length(d.allowed_location_ids, 1), 0) > 0 ELSE v_member_lids && d.allowed_location_ids END)
        )
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND CASE WHEN v_member_lids = '{}' THEN coalesce(array_length(f.allowed_location_ids, 1), 0) > 0 ELSE v_member_lids && f.allowed_location_ids END)
        )
    )
  );
END;
$$;

-- ── 2c. Kiosk training completion ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_kiosk_training_complete(
  p_location_id    uuid,
  p_team_member_id uuid,
  p_kiosk_token    uuid,
  p_document_id    uuid,
  p_completed      boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_role        text;
  v_is_owner    boolean;
  v_member_lids uuid[];
  v_steps       integer;
  v_indices     integer[];
BEGIN
  IF p_kiosk_token IS NULL OR p_team_member_id IS NULL OR p_document_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id, tm.role, coalesce(tm.is_owner, false), coalesce(tm.location_ids, '{}')
  INTO v_org_id, v_role, v_is_owner, v_member_lids
  FROM locations l
  JOIN team_members tm ON tm.organization_id = l.organization_id AND tm.id = p_team_member_id
  WHERE l.id = p_location_id
    AND l.kiosk_token = p_kiosk_token;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_array_length(d.metadata->'steps'), 0) INTO v_steps
  FROM infohub_documents d
  JOIN infohub_folders f ON f.id = d.folder_id
  WHERE d.id = p_document_id
    AND d.organization_id = v_org_id
    AND d.section = 'training'
    AND d.archived_at IS NULL
    AND (
      v_is_owner
      OR d.access_scope = 'org'
      OR p_team_member_id = ANY(d.allowed_team_member_ids)
      OR (v_role IS NOT NULL AND v_role = ANY(d.allowed_roles))
      OR (CASE WHEN v_member_lids = '{}' THEN coalesce(array_length(d.allowed_location_ids, 1), 0) > 0 ELSE v_member_lids && d.allowed_location_ids END)
    )
    AND (
      v_is_owner
      OR f.access_scope = 'org'
      OR p_team_member_id = ANY(f.allowed_team_member_ids)
      OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
      OR (CASE WHEN v_member_lids = '{}' THEN coalesce(array_length(f.allowed_location_ids, 1), 0) > 0 ELSE v_member_lids && f.allowed_location_ids END)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  v_indices := CASE WHEN p_completed
    THEN coalesce((SELECT array_agg(i) FROM generate_series(0, v_steps - 1) i), '{}')
    ELSE '{}'::integer[] END;

  INSERT INTO training_progress (organization_id, team_member_id, module_id, completed_step_indices, is_completed, completed_at, updated_at)
  VALUES (v_org_id, p_team_member_id, p_document_id::text, v_indices, p_completed, CASE WHEN p_completed THEN now() END, now())
  ON CONFLICT ON CONSTRAINT training_progress_org_member_module_key DO UPDATE
    SET completed_step_indices = EXCLUDED.completed_step_indices,
        is_completed = EXCLUDED.is_completed,
        completed_at = EXCLUDED.completed_at,
        updated_at = now();

  RETURN jsonb_build_object('module_id', p_document_id::text, 'is_completed', p_completed, 'completed_step_indices', to_jsonb(v_indices));
END;
$$;
