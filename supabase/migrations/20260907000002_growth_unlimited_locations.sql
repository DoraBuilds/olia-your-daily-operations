-- ================================================================
-- GROWTH: UNLIMITED LOCATIONS, BILLED PER LOCATION (correction, 2026-09-07)
--
-- Follow-up to 20260907000001_update_plan_tier_limits.sql, which incorrectly
-- capped Growth at 1 location (same as Starter). Growth pricing is per
-- location (€99/location/month) with no cap on how many a customer can add
-- self-serve — only Starter is hard-capped at 1 location. Only Enterprise
-- differs from Growth on locations by moving to a custom/negotiated
-- contract rather than self-serve Stripe billing, not by unlocking a higher
-- numeric cap Growth lacks.
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
  -- growth:     locations=-1 (unlimited, billed per location), staff=40, checklists=-1
  -- enterprise: all unlimited
  v_limit := CASE
    WHEN v_plan = 'enterprise' THEN -1
    WHEN v_plan = 'growth' THEN
      CASE p_limit_field
        WHEN 'maxLocations'  THEN -1
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
