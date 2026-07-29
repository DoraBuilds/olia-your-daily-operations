-- ================================================================
-- Restore RLS policies that were recorded as applied (per
-- `supabase migration list`) but are absent from the live production
-- schema — confirmed via `supabase db dump --linked` and a live,
-- rolled-back transaction simulating an authenticated manager.
--
-- Missing in production right now:
--   - locations:       no UPDATE policy at all (editing a location fails
--                       for every user, not just a permission bypass)
--   - staff_profiles:  no INSERT policy at all (adding staff fails for
--                       every user)
--   - folders:         zero policies at all (checklist folders cannot be
--                       read or written by anyone)
--   - alerts:          zero policies at all (dashboard/notifications
--                       alerts feed is empty for everyone)
--   - checklists:      no INSERT/UPDATE/DELETE policy (writes happen via
--                       save_checklist()/delete_checklist() RPCs which
--                       bypass RLS as SECURITY DEFINER, so this isn't a
--                       functional break, but restoring it closes the
--                       direct-table bypass path too)
--
-- These statements are copied verbatim from 20260312000002_server_permissions.sql
-- and 20260503000005_server_side_permission_gaps.sql, which already define
-- the intended state — this migration just re-applies it since something
-- (a manual dashboard change, most likely) dropped it outside the
-- migration system, undetected by the migration ledger.
-- ================================================================

-- ── locations: restore UPDATE policy ──────────────────────────────────────
DROP POLICY IF EXISTS "locations_update" ON locations;

CREATE POLICY "locations_update" ON locations FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('edit_location_details')
    AND location_is_plan_editable(id)
  );

-- ── staff_profiles: restore INSERT policy ─────────────────────────────────
DROP POLICY IF EXISTS "staff_profiles_insert" ON staff_profiles;

CREATE POLICY "staff_profiles_insert" ON staff_profiles FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('manage_staff_profiles')
    AND check_plan_limit(organization_id, 'staff_profiles', 'maxStaff')
  );

-- ── checklists: restore INSERT/UPDATE/DELETE policies ─────────────────────
DROP POLICY IF EXISTS "checklists_insert" ON checklists;
DROP POLICY IF EXISTS "checklists_update" ON checklists;
DROP POLICY IF EXISTS "checklists_delete" ON checklists;

CREATE POLICY "checklists_insert" ON checklists FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
    AND check_plan_limit(organization_id, 'checklists', 'maxChecklists')
  );

CREATE POLICY "checklists_update" ON checklists FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
  );

CREATE POLICY "checklists_delete" ON checklists FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
  );

-- ── folders: restore all policies (currently has none at all) ─────────────
DROP POLICY IF EXISTS "folders_select" ON folders;
DROP POLICY IF EXISTS "folders_insert" ON folders;
DROP POLICY IF EXISTS "folders_update" ON folders;
DROP POLICY IF EXISTS "folders_delete" ON folders;

CREATE POLICY "folders_select" ON folders FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "folders_insert" ON folders FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
  );

CREATE POLICY "folders_update" ON folders FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
  );

CREATE POLICY "folders_delete" ON folders FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_permission('create_edit_checklists')
  );

-- ── alerts: restore all policies (currently has none at all) ──────────────
DROP POLICY IF EXISTS "alerts_select" ON alerts;
DROP POLICY IF EXISTS "alerts_insert" ON alerts;
DROP POLICY IF EXISTS "alerts_update" ON alerts;
DROP POLICY IF EXISTS "alerts_delete" ON alerts;

CREATE POLICY "alerts_select" ON alerts FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "alerts_insert" ON alerts FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('manage_alerts')
  );

CREATE POLICY "alerts_update" ON alerts FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('manage_alerts')
  );

CREATE POLICY "alerts_delete" ON alerts FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_permission('manage_alerts')
  );

-- ── save_checklist(): add the permission check delete_checklist() already
-- has. This RPC (the actual create/update path the app uses) currently
-- enforces the plan-limit check but not the permission check, so any
-- authenticated team member can create/edit checklists regardless of
-- their create_edit_checklists flag. This is a genuine gap, not drift —
-- delete_checklist() (added in the same original PR) has always had this
-- check; save_checklist() never did. ─────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."save_checklist"(
  "p_id" "uuid",
  "p_title" "text",
  "p_description" "text" DEFAULT NULL::"text",
  "p_folder_id" "uuid" DEFAULT NULL::"uuid",
  "p_location_id" "uuid" DEFAULT NULL::"uuid",
  "p_location_ids" "uuid"[] DEFAULT NULL::"uuid"[],
  "p_start_date" "date" DEFAULT NULL::"date",
  "p_schedule" "jsonb" DEFAULT NULL::"jsonb",
  "p_sections" "jsonb" DEFAULT '[]'::"jsonb",
  "p_time_of_day" "text" DEFAULT 'anytime'::"text",
  "p_due_time" time without time zone DEFAULT NULL::time without time zone,
  "p_visibility_from" time without time zone DEFAULT NULL::time without time zone,
  "p_visibility_until" time without time zone DEFAULT NULL::time without time zone
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id    uuid;
  v_result_id uuid;
BEGIN
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no organization found';
  END IF;

  IF NOT public.has_permission('create_edit_checklists') THEN
    RAISE EXCEPTION 'Insufficient permissions to save checklists';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.checklists
    SET
      title            = p_title,
      description      = p_description,
      folder_id        = p_folder_id,
      location_id      = p_location_id,
      location_ids     = p_location_ids,
      start_date       = p_start_date,
      schedule         = p_schedule,
      sections         = p_sections,
      time_of_day      = COALESCE(p_time_of_day, 'anytime'),
      due_time         = p_due_time,
      visibility_from  = p_visibility_from,
      visibility_until = p_visibility_until,
      updated_at       = now()
    WHERE id = p_id
      AND organization_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checklist not found or does not belong to your organization';
    END IF;

    v_result_id := p_id;

  ELSE
    IF NOT public.check_plan_limit(v_org_id, 'checklists', 'maxChecklists') THEN
      RAISE EXCEPTION 'You have reached the checklist limit for your plan. Delete unused checklists or upgrade to create more.';
    END IF;

    INSERT INTO public.checklists (
      organization_id,
      title,
      description,
      folder_id,
      location_id,
      location_ids,
      start_date,
      schedule,
      sections,
      time_of_day,
      due_time,
      visibility_from,
      visibility_until
    ) VALUES (
      v_org_id,
      p_title,
      p_description,
      p_folder_id,
      p_location_id,
      p_location_ids,
      p_start_date,
      p_schedule,
      COALESCE(p_sections, '[]'::jsonb),
      COALESCE(p_time_of_day, 'anytime'),
      p_due_time,
      p_visibility_from,
      p_visibility_until
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;
