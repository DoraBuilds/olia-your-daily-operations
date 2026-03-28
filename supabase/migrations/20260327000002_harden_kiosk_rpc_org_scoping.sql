-- ================================================================
-- Harden kiosk RPC scoping and remove unsafe anon location reads.
--
-- Problem:
--   1. anon_read_locations exposed every location row to the anon role.
--   2. get_kiosk_checklists used SECURITY DEFINER without constraining
--      results to the organization of the selected location.
--   3. validate_staff_pin matched location/all-location staff without
--      explicitly constraining the result to the selected location's org.
--
-- This migration moves the final state to a safer baseline:
--   - drop the global anon locations policy
--   - scope kiosk checklist reads to the selected location's org
--   - scope PIN validation to the selected location's org
--   - require authenticated callers to stay inside current_org_id()
--
-- Note:
--   The kiosk setup screen now fails safely when it cannot read any
--   locations, so removing anon location enumeration is acceptable
--   until a dedicated public location-selection model is introduced.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Remove unsafe anon location enumeration
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS anon_read_locations ON public.locations;

-- ----------------------------------------------------------------
-- 2. Harden get_kiosk_checklists
-- ----------------------------------------------------------------

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
       AND (c.location_id = p_location_id OR c.location_id IS NULL)
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
       AND (c.location_id = p_location_id OR c.location_id IS NULL)
     ORDER BY c.due_time ASC NULLS LAST, c.title ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Harden validate_staff_pin
-- ----------------------------------------------------------------

DROP FUNCTION IF EXISTS public.validate_staff_pin(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_staff_pin(p_pin text, p_location_id uuid)
RETURNS TABLE(
  id              uuid,
  first_name      text,
  last_name       text,
  role            text,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN QUERY
      SELECT
        sp.id,
        sp.first_name,
        sp.last_name,
        sp.role,
        sp.organization_id
      FROM public.locations target
      JOIN public.staff_profiles sp
        ON sp.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
       AND (sp.location_id = p_location_id OR sp.location_id IS NULL)
       AND sp.status = 'active'
     ORDER BY CASE WHEN sp.location_id = p_location_id THEN 0 ELSE 1 END
     LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT
        sp.id,
        sp.first_name,
        sp.last_name,
        sp.role,
        sp.organization_id
      FROM public.locations target
      JOIN public.staff_profiles sp
        ON sp.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
       AND (sp.location_id = p_location_id OR sp.location_id IS NULL)
       AND sp.status = 'active'
     ORDER BY CASE WHEN sp.location_id = p_location_id THEN 0 ELSE 1 END
     LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_staff_pin(text, uuid) TO anon, authenticated;
