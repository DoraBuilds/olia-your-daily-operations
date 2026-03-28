-- ================================================================
-- Add multi-location targeting to checklists.
--
-- Problem:
--   The checklist builder now supports targeting one, some, or all
--   locations, but the schema only persisted a single location_id.
--
-- This migration adds a nullable location_ids array for explicit
-- multi-location targeting while keeping location_id for backward
-- compatibility with existing code and older rows.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS location_ids uuid[] NULL;

UPDATE public.checklists
SET location_ids = ARRAY[location_id]
WHERE location_id IS NOT NULL
  AND location_ids IS NULL;

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
