-- ================================================================
-- Close remaining server-side permission and plan-limit gaps.
--
-- What was already enforced (20260312000002_server_permissions.sql):
--   - staff_profiles write/update/delete: has_permission('manage_staff_profiles')
--   - locations insert: check_plan_limit maxLocations
--   - checklists insert: check_plan_limit maxChecklists
--
-- What this migration adds:
--   1. checklists insert/update/delete: has_permission('create_edit_checklists')
--   2. folders all writes: has_permission('create_edit_checklists')
--   3. locations update: has_permission('edit_location_details')
--   4. alerts writes: has_permission('manage_alerts')
--   5. staff_profiles insert: check_plan_limit maxStaff (was missing alongside permission check)
-- ================================================================

-- ── 1. Checklists — add permission check to writes ────────────────────────────

DROP POLICY IF EXISTS "checklists_insert_within_limit" ON checklists;
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

-- ── 2. Folders — add permission check to writes ───────────────────────────────
-- The original "folders_all" policy (for all using org_id) is replaced with
-- separate read vs write policies.

DROP POLICY IF EXISTS "folders_all" ON folders;

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

-- ── 3. Locations update — add permission check ────────────────────────────────
-- The current policy (from 20260408000001) checks plan editability but not
-- the user's permission to edit location details.

DROP POLICY IF EXISTS "locations_update" ON locations;

CREATE POLICY "locations_update" ON locations FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('edit_location_details')
    AND location_is_plan_editable(id)
  );

-- ── 4. Alerts — split into read vs write, add permission check on writes ──────
-- The original "alerts_all" policy allows any team member to do everything.
-- Managers have manage_alerts: false by default, so they should not be able
-- to create, edit or delete alerts — only read them.

DROP POLICY IF EXISTS "alerts_all" ON alerts;

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

-- ── 5. Staff profiles insert — add missing plan limit check ───────────────────
-- The existing policy had the permission check but not the staff count limit.

DROP POLICY IF EXISTS "staff_profiles_insert_permitted" ON staff_profiles;

CREATE POLICY "staff_profiles_insert" ON staff_profiles FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('manage_staff_profiles')
    AND check_plan_limit(organization_id, 'staff_profiles', 'maxStaff')
  );
