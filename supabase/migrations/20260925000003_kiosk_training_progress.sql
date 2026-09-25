-- Kiosk training completion (#905).
--
-- training_progress was keyed to auth.users (user_id), so PIN-only team
-- members (no admin-app login) could never have progress, and the kiosk —
-- which runs as anon — could not write it. Progress is now keyed to the
-- team member; the web app reads/writes it via RLS for the signed-in
-- member, the kiosk via two SECURITY DEFINER RPCs checked against the
-- kiosk token + the member who identified with their PIN.

-- ── 1. Key progress by team member ───────────────────────────────
ALTER TABLE public.training_progress
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE;

-- Backfill: a login maps to its team member either by id (owners/managers
-- created at signup) or by auth_user_id (members who accepted an invite).
UPDATE public.training_progress tp
SET team_member_id = tm.id
FROM public.team_members tm
WHERE tp.team_member_id IS NULL
  AND tm.organization_id = tp.organization_id
  AND (tm.id = tp.user_id OR tm.auth_user_id = tp.user_id);

-- Should two logins ever map to the same member, keep the latest row.
DELETE FROM public.training_progress tp
USING public.training_progress newer
WHERE tp.team_member_id IS NOT NULL
  AND newer.team_member_id = tp.team_member_id
  AND newer.organization_id = tp.organization_id
  AND newer.module_id = tp.module_id
  AND (newer.updated_at, newer.id) > (tp.updated_at, tp.id);

-- Kiosk writes have no login. Rows that matched no team member are left
-- as-is (unreachable, like before for a removed member) rather than deleted.
ALTER TABLE public.training_progress ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_organization_id_user_id_module_id_key;
ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_org_member_module_key;
ALTER TABLE public.training_progress
  ADD CONSTRAINT training_progress_org_member_module_key UNIQUE (organization_id, team_member_id, module_id);

-- ── 2. The signed-in user's team member (mirrors current_org_id) ──
CREATE OR REPLACE FUNCTION public.current_team_member_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM team_members
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1
$$;

-- ── 3. RLS: a member sees and edits only their own progress ──────
DROP POLICY IF EXISTS training_progress_select ON public.training_progress;
CREATE POLICY training_progress_select ON public.training_progress FOR SELECT
  USING (organization_id = current_org_id() AND team_member_id = current_team_member_id());

DROP POLICY IF EXISTS training_progress_insert ON public.training_progress;
CREATE POLICY training_progress_insert ON public.training_progress FOR INSERT
  WITH CHECK (organization_id = current_org_id() AND team_member_id = current_team_member_id());

DROP POLICY IF EXISTS training_progress_update ON public.training_progress;
CREATE POLICY training_progress_update ON public.training_progress FOR UPDATE
  USING (organization_id = current_org_id() AND team_member_id = current_team_member_id())
  WITH CHECK (organization_id = current_org_id() AND team_member_id = current_team_member_id());

DROP POLICY IF EXISTS training_progress_delete ON public.training_progress;
CREATE POLICY training_progress_delete ON public.training_progress FOR DELETE
  USING (organization_id = current_org_id() AND team_member_id = current_team_member_id());

-- ── 4. Kiosk: read the identified member's progress ──────────────
CREATE OR REPLACE FUNCTION public.get_kiosk_training_progress(
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
  IF p_kiosk_token IS NULL OR p_team_member_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT l.organization_id INTO v_org_id
  FROM locations l
  JOIN team_members tm ON tm.organization_id = l.organization_id AND tm.id = p_team_member_id
  WHERE l.id = p_location_id
    AND l.kiosk_token = p_kiosk_token;

  IF v_org_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'module_id', tp.module_id,
      'is_completed', tp.is_completed,
      'completed_step_indices', tp.completed_step_indices
    )), '[]'::jsonb)
    FROM training_progress tp
    WHERE tp.organization_id = v_org_id
      AND tp.team_member_id = p_team_member_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kiosk_training_progress(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_training_progress(uuid, uuid, uuid) TO anon, authenticated;

-- ── 5. Kiosk: mark a training doc complete / not complete ────────
-- Only for a live training doc this member can see (same rules as
-- get_kiosk_library). The step count comes from the doc, not the client.
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
      OR (v_member_lids <> '{}' AND v_member_lids && d.allowed_location_ids)
    )
    AND (
      v_is_owner
      OR f.access_scope = 'org'
      OR p_team_member_id = ANY(f.allowed_team_member_ids)
      OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
      OR (v_member_lids <> '{}' AND v_member_lids && f.allowed_location_ids)
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

REVOKE ALL ON FUNCTION public.set_kiosk_training_complete(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_kiosk_training_complete(uuid, uuid, uuid, uuid, boolean) TO anon, authenticated;
