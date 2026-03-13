-- ================================================================
-- SERVER-SIDE PERMISSION ENFORCEMENT
-- Manager permissions are now enforced at the database layer,
-- not just in React component state.
-- ================================================================

-- Helper: check a permission flag for the current authenticated user.
-- Returns false if the user isn't authenticated or the flag doesn't exist.
CREATE OR REPLACE FUNCTION has_permission(perm text)
RETURNS boolean AS $$
  SELECT COALESCE((permissions->>perm)::boolean, false)
  FROM team_members
  WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Staff Profiles: write operations require manage_staff_profiles ────────────

DROP POLICY IF EXISTS "staff_profiles_write" ON staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_update" ON staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_delete" ON staff_profiles;

CREATE POLICY "staff_profiles_insert_permitted" ON staff_profiles FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_permission('manage_staff_profiles')
  );

CREATE POLICY "staff_profiles_update_permitted" ON staff_profiles FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND has_permission('manage_staff_profiles')
  );

CREATE POLICY "staff_profiles_delete_permitted" ON staff_profiles FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_permission('manage_staff_profiles')
  );

-- ── Plan Limit Enforcement ────────────────────────────────────────────────────
-- Prevent exceeding plan limits at the database level for the three
-- key bounded resources: locations, staff_profiles, checklists.

CREATE OR REPLACE FUNCTION check_plan_limit(
  p_org_id uuid,
  p_table text,
  p_limit_field text
)
RETURNS boolean AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT plan INTO v_plan FROM organizations WHERE id = p_org_id;

  -- Resolve limit from plan
  -- starter: locations=1, staff=15, checklists=10
  -- growth:  locations=10, staff=200, checklists=-1 (unlimited)
  -- enterprise: all unlimited
  v_limit := CASE
    WHEN v_plan = 'enterprise' THEN -1
    WHEN v_plan = 'growth' THEN
      CASE p_limit_field
        WHEN 'maxLocations'  THEN 10
        WHEN 'maxStaff'      THEN 200
        WHEN 'maxChecklists' THEN -1
        ELSE -1
      END
    ELSE -- starter
      CASE p_limit_field
        WHEN 'maxLocations'  THEN 1
        WHEN 'maxStaff'      THEN 15
        WHEN 'maxChecklists' THEN 10
        ELSE -1
      END
  END;

  IF v_limit = -1 THEN RETURN true; END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE organization_id = $1',
    p_table
  ) INTO v_count USING p_org_id;

  RETURN v_count < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Apply limit check to locations inserts
DROP POLICY IF EXISTS "locations_all" ON locations;

CREATE POLICY "locations_select" ON locations FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "locations_insert_within_limit" ON locations FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND check_plan_limit(organization_id, 'locations', 'maxLocations')
  );

CREATE POLICY "locations_update" ON locations FOR UPDATE
  USING (organization_id = current_org_id());

CREATE POLICY "locations_delete" ON locations FOR DELETE
  USING (organization_id = current_org_id());

-- Apply limit check to checklists inserts
DROP POLICY IF EXISTS "checklists_all" ON checklists;

CREATE POLICY "checklists_select" ON checklists FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "checklists_insert_within_limit" ON checklists FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND check_plan_limit(organization_id, 'checklists', 'maxChecklists')
  );

CREATE POLICY "checklists_update" ON checklists FOR UPDATE
  USING (organization_id = current_org_id());

CREATE POLICY "checklists_delete" ON checklists FOR DELETE
  USING (organization_id = current_org_id());

-- ── Audit Log: ensure managers can insert their own org's audit records ───────
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;

CREATE POLICY "audit_log_insert_own_org" ON audit_log FOR INSERT
  WITH CHECK (organization_id = current_org_id());
