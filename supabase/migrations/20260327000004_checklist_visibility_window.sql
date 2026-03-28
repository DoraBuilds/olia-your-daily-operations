-- ================================================================
-- Add optional checklist visibility window.
--
-- This keeps the legacy due_time column for older checklists, but lets
-- the builder and kiosk prefer an explicit visible-from / visible-until
-- range for newly created checklists.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS visibility_from time without time zone,
  ADD COLUMN IF NOT EXISTS visibility_until time without time zone;

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
        to_char(c.visibility_from, 'HH24:MI') AS visibility_from,
        to_char(c.visibility_until, 'HH24:MI') AS visibility_until,
        c.sections
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND (c.location_id = p_location_id OR c.location_id IS NULL)
     ORDER BY COALESCE(c.visibility_from, c.due_time) ASC NULLS LAST, c.title ASC;
  ELSE
    RETURN QUERY
      SELECT
        c.id,
        c.title,
        c.location_id,
        c.time_of_day,
        to_char(c.due_time, 'HH24:MI') AS due_time,
        to_char(c.visibility_from, 'HH24:MI') AS visibility_from,
        to_char(c.visibility_until, 'HH24:MI') AS visibility_until,
        c.sections
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND (c.location_id = p_location_id OR c.location_id IS NULL)
     ORDER BY COALESCE(c.visibility_from, c.due_time) ASC NULLS LAST, c.title ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid) TO anon, authenticated;
