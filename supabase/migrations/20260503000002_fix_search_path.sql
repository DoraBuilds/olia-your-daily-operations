-- ================================================================
-- SEQ-011: Add SET search_path = public to all SECURITY DEFINER
-- functions that were missing it.
--
-- Without SET search_path, a SECURITY DEFINER function resolves
-- table/function names against the caller's search_path, which can
-- include pg_temp. An attacker who can create objects in pg_temp
-- could shadow real tables and have them resolved by the privileged
-- function instead.
--
-- Functions fixed here are the ones whose LAST definition (the one
-- that is actually live) was missing the clause. Functions that were
-- already recreated with SET search_path in a later migration are
-- not touched.
-- ================================================================

-- ── 1. current_org_id() ──────────────────────────────────────────
-- Last defined in: 20260304000001_initial_schema.sql (missing SET search_path)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM team_members WHERE id = auth.uid()
$$;

-- ── 2. has_permission(text) ──────────────────────────────────────
-- Last defined in: 20260312000002_server_permissions.sql (missing SET search_path)
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((permissions->>perm)::boolean, false)
  FROM team_members
  WHERE id = auth.uid()
$$;

-- ── 3. check_plan_limit(uuid, text, text) ────────────────────────
-- Last defined in: 20260312000002_server_permissions.sql (missing SET search_path)
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
  -- starter:    locations=1,  staff=15,  checklists=10
  -- growth:     locations=10, staff=200, checklists=-1 (unlimited)
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
$$;

-- ── 4. get_kiosk_checklists(uuid) ────────────────────────────────
-- Last defined in: 20260327000005_checklists_location_ids.sql (missing SET search_path)
DROP FUNCTION IF EXISTS public.get_kiosk_checklists(uuid);

CREATE OR REPLACE FUNCTION public.get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE (
  id          uuid,
  title       text,
  location_id uuid,
  time_of_day text,
  due_time    text,
  sections    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN QUERY
      SELECT
        c.id,
        c.title,
        c.location_id,
        c.time_of_day,
        to_char(c.due_time, 'HH24:MI') AS due_time,
        c.sections
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND (
         c.location_ids IS NULL
         OR p_location_id = ANY(c.location_ids)
         OR c.location_id = p_location_id
       )
     ORDER BY c.due_time ASC NULLS LAST, c.title ASC;
  ELSE
    RETURN QUERY
      SELECT
        c.id,
        c.title,
        c.location_id,
        c.time_of_day,
        to_char(c.due_time, 'HH24:MI') AS due_time,
        c.sections
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND (
         c.location_ids IS NULL
         OR p_location_id = ANY(c.location_ids)
         OR c.location_id = p_location_id
       )
     ORDER BY c.due_time ASC NULLS LAST, c.title ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid) TO anon, authenticated;
