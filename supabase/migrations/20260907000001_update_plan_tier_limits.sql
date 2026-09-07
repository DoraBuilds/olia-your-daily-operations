-- ================================================================
-- UPDATE PLAN TIER LIMITS (pricing restructure, 2026-09-07)
--
-- New tiers (see src/lib/plan-features.ts for the client-side mirror):
--   starter:    locations=1, staff=20, checklists=unlimited
--   growth:     locations=1 (was 10), staff=40 (was 200), checklists=unlimited
--   enterprise: all unlimited (unchanged)
--
-- Growth no longer raises the location cap over Starter — only Enterprise
-- does. Any existing org already over its new limit falls back to the
-- existing location_grace_period_ends_at mechanism (see useLocations.ts),
-- it is not locked out immediately.
-- ================================================================

CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_org_id     uuid,
  p_table      text,
  p_limit_field text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT plan INTO v_plan FROM organizations WHERE id = p_org_id;

  -- Resolve limit from plan
  -- starter:    locations=1, staff=20, checklists=-1 (unlimited)
  -- growth:     locations=1, staff=40, checklists=-1 (unlimited)
  -- enterprise: all unlimited
  v_limit := CASE
    WHEN v_plan = 'enterprise' THEN -1
    WHEN v_plan = 'growth' THEN
      CASE p_limit_field
        WHEN 'maxLocations'  THEN 1
        WHEN 'maxStaff'      THEN 40
        WHEN 'maxChecklists' THEN -1
        ELSE -1
      END
    ELSE -- starter
      CASE p_limit_field
        WHEN 'maxLocations'  THEN 1
        WHEN 'maxStaff'      THEN 20
        WHEN 'maxChecklists' THEN -1
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
$$;
