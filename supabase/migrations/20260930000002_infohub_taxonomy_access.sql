-- Info Hub access follows the company taxonomy (Concept → Location →
-- Department) instead of roles.
--
-- Restricted folders / documents are now shared with:
--   • a place  — whole concepts (allowed_concept_ids, live: covers locations
--                added to the concept later) and/or specific locations
--                (allowed_location_ids); nothing picked = every location
--   • AND a department (allowed_department_ids); nothing picked = every
--     department
--   • OR specific team members (allowed_team_member_ids), as before.
-- Restricted content with nothing picked stays owner-only. A team member
-- with no specific locations (= every location) matches any place.
--
-- Roles are no longer part of the rule. So nobody loses access, content
-- that was shared with a role is now shared with the team members who hold
-- that role today. The allowed_roles columns stay (emptied, unused) so the
-- previous web build keeps loading while the new one deploys.

-- ── 1. Columns ───────────────────────────────────────────────────
ALTER TABLE infohub_folders
  ADD COLUMN IF NOT EXISTS allowed_concept_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS allowed_department_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE infohub_documents
  ADD COLUMN IF NOT EXISTS allowed_concept_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS allowed_department_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- ── 2. Role shares become shares with the people holding that role ──
UPDATE infohub_folders f
SET allowed_team_member_ids = ARRAY(
      SELECT DISTINCT id FROM (
        SELECT unnest(f.allowed_team_member_ids) AS id
        UNION ALL
        SELECT tm.id FROM team_members tm
        WHERE tm.organization_id = f.organization_id AND tm.role = ANY(f.allowed_roles)
      ) ids
    ),
    allowed_roles = '{}'::text[]
WHERE cardinality(f.allowed_roles) > 0;

UPDATE infohub_documents d
SET allowed_team_member_ids = ARRAY(
      SELECT DISTINCT id FROM (
        SELECT unnest(d.allowed_team_member_ids) AS id
        UNION ALL
        SELECT tm.id FROM team_members tm
        WHERE tm.organization_id = d.organization_id AND tm.role = ANY(d.allowed_roles)
      ) ids
    ),
    allowed_roles = '{}'::text[]
WHERE cardinality(d.allowed_roles) > 0;

-- ── 3. The sharing rule, for one team member ─────────────────────
-- Single source of truth for the web Info Hub, the kiosk Infohub and kiosk
-- training completion. Mirrored client-side by canAccessInfohubContent.
CREATE OR REPLACE FUNCTION public.infohub_member_matches(
  p_org_id uuid,
  p_team_member_id uuid,
  p_access_scope infohub_access_scope,
  p_allowed_team_member_ids uuid[],
  p_allowed_concept_ids uuid[],
  p_allowed_location_ids uuid[],
  p_allowed_department_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p_access_scope = 'org'
    OR EXISTS (
      SELECT 1
      FROM team_members tm
      WHERE tm.id = p_team_member_id
        AND tm.organization_id = p_org_id
        AND (
          COALESCE(tm.is_owner, false)
          OR tm.id = ANY(COALESCE(p_allowed_team_member_ids, '{}'::uuid[]))
          OR (
            COALESCE(cardinality(p_allowed_concept_ids), 0)
              + COALESCE(cardinality(p_allowed_location_ids), 0)
              + COALESCE(cardinality(p_allowed_department_ids), 0) > 0
            AND (
              COALESCE(cardinality(p_allowed_concept_ids), 0) + COALESCE(cardinality(p_allowed_location_ids), 0) = 0
              -- No specific locations = every location.
              OR COALESCE(cardinality(tm.location_ids), 0) = 0
              OR tm.location_ids && COALESCE(p_allowed_location_ids, '{}'::uuid[])
              OR EXISTS (
                SELECT 1 FROM locations l
                WHERE l.id = ANY(tm.location_ids)
                  AND l.concept_id = ANY(COALESCE(p_allowed_concept_ids, '{}'::uuid[]))
              )
            )
            AND (
              COALESCE(cardinality(p_allowed_department_ids), 0) = 0
              OR COALESCE(tm.department_ids, '{}'::uuid[]) && p_allowed_department_ids
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.infohub_member_matches(uuid, uuid, infohub_access_scope, uuid[], uuid[], uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- ── 4. Web Info Hub (RLS helpers) ────────────────────────────────
CREATE OR REPLACE FUNCTION infohub_scope_allows(
  p_org_id uuid,
  p_access_scope infohub_access_scope,
  p_allowed_team_member_ids uuid[],
  p_allowed_concept_ids uuid[],
  p_allowed_location_ids uuid[],
  p_allowed_department_ids uuid[]
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
      OR public.platform_admin_viewing_org() IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
          AND tm.organization_id = p_org_id
          AND public.infohub_member_matches(
            p_org_id, tm.id, p_access_scope, p_allowed_team_member_ids,
            p_allowed_concept_ids, p_allowed_location_ids, p_allowed_department_ids
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION infohub_can_access_folder(p_folder_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE folder_tree AS (
    SELECT f.id, f.organization_id, f.parent_id, f.access_scope, f.allowed_team_member_ids,
           f.allowed_concept_ids, f.allowed_location_ids, f.allowed_department_ids
    FROM infohub_folders f
    WHERE f.id = p_folder_id

    UNION ALL

    SELECT parent.id, parent.organization_id, parent.parent_id, parent.access_scope, parent.allowed_team_member_ids,
           parent.allowed_concept_ids, parent.allowed_location_ids, parent.allowed_department_ids
    FROM infohub_folders parent
    JOIN folder_tree child ON child.parent_id = parent.id
  )
  SELECT
    COALESCE(
      bool_and(
        infohub_scope_allows(
          organization_id, access_scope, allowed_team_member_ids,
          allowed_concept_ids, allowed_location_ids, allowed_department_ids
        )
      ),
      false
    )
  FROM folder_tree;
$$;

CREATE OR REPLACE FUNCTION infohub_can_access_document(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM infohub_documents d
      WHERE d.id = p_document_id
        AND infohub_scope_allows(
          d.organization_id, d.access_scope, d.allowed_team_member_ids,
          d.allowed_concept_ids, d.allowed_location_ids, d.allowed_department_ids
        )
        AND infohub_can_access_folder(d.folder_id)
    );
$$;

-- The role-based overload is no longer referenced.
DROP FUNCTION IF EXISTS infohub_scope_allows(uuid, infohub_access_scope, uuid[], text[], uuid[]);

-- ── 5. Kiosk Infohub ─────────────────────────────────────────────
-- Bodies unchanged from 20260925000005 except for the sharing rule.
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
  v_org_id uuid;
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
        AND infohub_member_matches(
          v_org_id, p_team_member_id, f.access_scope, f.allowed_team_member_ids,
          f.allowed_concept_ids, f.allowed_location_ids, f.allowed_department_ids
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
        AND infohub_member_matches(
          v_org_id, p_team_member_id, d.access_scope, d.allowed_team_member_ids,
          d.allowed_concept_ids, d.allowed_location_ids, d.allowed_department_ids
        )
        AND infohub_member_matches(
          v_org_id, p_team_member_id, f.access_scope, f.allowed_team_member_ids,
          f.allowed_concept_ids, f.allowed_location_ids, f.allowed_department_ids
        )
    )
  );
END;
$$;

-- ── 6. Kiosk training completion ─────────────────────────────────
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
  v_org_id  uuid;
  v_steps   integer;
  v_indices integer[];
BEGIN
  IF p_kiosk_token IS NULL OR p_team_member_id IS NULL OR p_document_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id
  INTO v_org_id
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
    AND infohub_member_matches(
      v_org_id, p_team_member_id, d.access_scope, d.allowed_team_member_ids,
      d.allowed_concept_ids, d.allowed_location_ids, d.allowed_department_ids
    )
    AND infohub_member_matches(
      v_org_id, p_team_member_id, f.access_scope, f.allowed_team_member_ids,
      f.allowed_concept_ids, f.allowed_location_ids, f.allowed_department_ids
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
