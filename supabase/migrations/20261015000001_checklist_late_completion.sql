-- ================================================================
-- Checklist timing: "Allow late completion" + per-location day end.
--
-- The checklist's window end is the deadline. With late completion ON the
-- checklist moves to Overdue after the window (recorded as late) until the
-- end of the location's operating day; with it OFF it goes straight to
-- Missed. Existing checklists default to ON so nothing that is Overdue
-- today disappears.
--
-- locations.day_end_time is the end of the operating day (e.g. 04:00 for a
-- late bar). Default 00:00 = midnight.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS allow_late_completion boolean NOT NULL DEFAULT true;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS day_end_time time without time zone NOT NULL DEFAULT '00:00';

-- ── save_checklist: append p_allow_late_completion (defaulted so a stale
--    cached frontend mid-deploy keeps prior behaviour) ──
DROP FUNCTION IF EXISTS public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.save_checklist(
  p_id                    uuid,
  p_title                 text,
  p_description           text    DEFAULT NULL,
  p_folder_id             uuid    DEFAULT NULL,
  p_location_id           uuid    DEFAULT NULL,
  p_location_ids          uuid[]  DEFAULT NULL,
  p_start_date            date    DEFAULT NULL,
  p_schedule              jsonb   DEFAULT NULL,
  p_sections              jsonb   DEFAULT '[]',
  p_time_of_day           text    DEFAULT 'anytime',
  p_due_time              time    DEFAULT NULL,
  p_visibility_from       time    DEFAULT NULL,
  p_visibility_until      time    DEFAULT NULL,
  p_is_published          boolean DEFAULT true,
  p_department_ids        uuid[]  DEFAULT NULL,
  p_concept_id            uuid    DEFAULT NULL,
  p_allow_late_completion boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_result_id uuid;
BEGIN
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no organization found';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.checklists
    SET
      title                 = p_title,
      description           = p_description,
      folder_id             = p_folder_id,
      location_id           = p_location_id,
      location_ids          = p_location_ids,
      concept_id            = p_concept_id,
      start_date            = p_start_date,
      schedule              = p_schedule,
      sections              = p_sections,
      time_of_day           = COALESCE(p_time_of_day, 'anytime'),
      due_time              = p_due_time,
      visibility_from       = p_visibility_from,
      visibility_until      = p_visibility_until,
      is_published          = p_is_published,
      department_ids        = p_department_ids,
      allow_late_completion = COALESCE(p_allow_late_completion, true),
      updated_at            = now()
    WHERE id = p_id
      AND organization_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checklist not found or does not belong to your organization';
    END IF;

    v_result_id := p_id;

  ELSE
    IF NOT public.check_plan_limit(v_org_id, 'checklists', 'maxChecklists') THEN
      RAISE EXCEPTION 'You have reached the checklist limit for your plan. Delete unused checklists or upgrade to create more.';
    END IF;

    INSERT INTO public.checklists (
      organization_id,
      title,
      description,
      folder_id,
      location_id,
      location_ids,
      concept_id,
      start_date,
      schedule,
      sections,
      time_of_day,
      due_time,
      visibility_from,
      visibility_until,
      is_published,
      department_ids,
      allow_late_completion
    ) VALUES (
      v_org_id,
      p_title,
      p_description,
      p_folder_id,
      p_location_id,
      p_location_ids,
      p_concept_id,
      p_start_date,
      p_schedule,
      COALESCE(p_sections, '[]'::jsonb),
      COALESCE(p_time_of_day, 'anytime'),
      p_due_time,
      p_visibility_from,
      p_visibility_until,
      p_is_published,
      p_department_ids,
      COALESCE(p_allow_late_completion, true)
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[], uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[], uuid, boolean) TO authenticated;

-- ── get_kiosk_checklists: also return allow_late_completion and the
--    location's day_end_time (same value on every row) ──
DROP FUNCTION IF EXISTS public.get_kiosk_checklists(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_kiosk_checklists(p_location_id uuid, p_department_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id                    uuid,
  title                 text,
  location_id           uuid,
  time_of_day           text,
  due_time              text,
  visibility_from       text,
  visibility_until      text,
  sections              jsonb,
  allow_late_completion boolean,
  day_end_time          text
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
        c.sections,
        c.allow_late_completion,
        to_char(target.day_end_time, 'HH24:MI') AS day_end_time
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND c.is_published = true
       AND (
         (c.location_ids IS NULL AND c.concept_id IS NULL)
         OR p_location_id = ANY(c.location_ids)
         OR c.location_id = p_location_id
         OR (c.concept_id IS NOT NULL AND c.concept_id = target.concept_id)
       )
       AND (
         c.department_ids IS NULL
         OR COALESCE(array_length(p_department_ids, 1), 0) = 0
         OR c.department_ids && p_department_ids
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
        c.sections,
        c.allow_late_completion,
        to_char(target.day_end_time, 'HH24:MI') AS day_end_time
      FROM public.locations target
      JOIN public.checklists c
        ON c.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND c.is_published = true
       AND (
         (c.location_ids IS NULL AND c.concept_id IS NULL)
         OR p_location_id = ANY(c.location_ids)
         OR c.location_id = p_location_id
         OR (c.concept_id IS NOT NULL AND c.concept_id = target.concept_id)
       )
       AND (
         c.department_ids IS NULL
         OR COALESCE(array_length(p_department_ids, 1), 0) = 0
         OR c.department_ids && p_department_ids
       )
     ORDER BY COALESCE(c.visibility_from, c.due_time) ASC NULLS LAST, c.title ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_checklists(uuid, uuid[]) TO anon, authenticated;
