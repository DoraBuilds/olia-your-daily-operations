-- ================================================================
-- REMOVE STAFF CAP FROM PLAN TIERS (pricing: unlimited users per location)
--
-- starter:    locations=1, staff=unlimited, checklists=unlimited
-- growth:     locations=unlimited (billed per location), staff=unlimited
-- enterprise: all unlimited
--
-- Mirrors src/lib/plan-features.ts. Only maxLocations is capped (Starter).
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

  v_limit := CASE
    WHEN v_plan IN ('enterprise', 'growth') THEN -1
    ELSE -- starter
      CASE p_limit_field
        WHEN 'maxLocations'  THEN 1
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
