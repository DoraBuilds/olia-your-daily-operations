-- ================================================================
-- Fix get_kiosk_checklists: restore visibility_from / visibility_until.
--
-- Migration 20260327000005 (location_ids) and 20260503000002
-- (fix_search_path) both recreated this function from a copy that
-- predated 20260327000004 (checklist_visibility_window), dropping
-- the visibility_from / visibility_until output columns. As a result
-- the kiosk RPC never returned those values — all checklists appeared
-- as "Visible all day" and no time-window filtering was applied.
--
-- This migration reinstates the complete, correct function definition:
--   - visibility_from / visibility_until columns in RETURNS TABLE
--   - to_char() casts for both columns in both SELECT branches
--   - location_ids array filtering (from 000005)
--   - SET search_path = public (from 000002)
--   - ORDER BY COALESCE(visibility_from, due_time) (from 000004)
-- ================================================================

DROP FUNCTION IF EXISTS public.get_kiosk_checklists(uuid);

CREATE OR REPLACE FUNCTION public.get_kiosk_checklists(p_location_id uuid)
RETURNS TABLE (
  id               uuid,
  title            text,
  location_id      uuid,
  time_of_day      text,
  due_time         text,
  visibility_from  text,
  visibility_until text,
  sections         jsonb
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
        to_char(c.due_time, 'HH24:MI')         AS due_time,
        to_char(c.visibility_from, 'HH24:MI')  AS visibility_from,
        to_char(c.visibility_until, 'HH24:MI') AS visibility_until,
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
     ORDER BY COALESCE(c.visibility_from, c.due_time) ASC NULLS LAST, c.title ASC;
  ELSE
    RETURN QUERY
      SELECT
        c.id,
        c.title,
        c.location_id,
        c.time_of_day,
        to_char(c.due_time, 'HH24:MI')         AS due_time,
        to_char(c.visibility_from, 'HH24:MI')  AS visibility_from,
        to_char(c.visibility_until, 'HH24:MI') AS visibility_until,
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
     ORDER BY COALESCE(c.visibility_from, c.due_time) ASC NULLS LAST, c.title ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid) TO anon, authenticated;
