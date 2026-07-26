-- Make p_description optional (DEFAULT NULL) so callers that omit it
-- (e.g. cached old app code during a deploy window) don't get a
-- "wrong number of arguments" error.
DROP FUNCTION IF EXISTS public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time);

CREATE OR REPLACE FUNCTION public.save_checklist(
  p_id               uuid,
  p_title            text,
  p_description      text    DEFAULT NULL,
  p_folder_id        uuid    DEFAULT NULL,
  p_location_id      uuid    DEFAULT NULL,
  p_location_ids     uuid[]  DEFAULT NULL,
  p_start_date       date    DEFAULT NULL,
  p_schedule         jsonb   DEFAULT NULL,
  p_sections         jsonb   DEFAULT '[]',
  p_time_of_day      text    DEFAULT 'anytime',
  p_due_time         time    DEFAULT NULL,
  p_visibility_from  time    DEFAULT NULL,
  p_visibility_until time    DEFAULT NULL
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
      title            = p_title,
      description      = p_description,
      folder_id        = p_folder_id,
      location_id      = p_location_id,
      location_ids     = p_location_ids,
      start_date       = p_start_date,
      schedule         = p_schedule,
      sections         = p_sections,
      time_of_day      = COALESCE(p_time_of_day, 'anytime'),
      due_time         = p_due_time,
      visibility_from  = p_visibility_from,
      visibility_until = p_visibility_until,
      updated_at       = now()
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
      start_date,
      schedule,
      sections,
      time_of_day,
      due_time,
      visibility_from,
      visibility_until
    ) VALUES (
      v_org_id,
      p_title,
      p_description,
      p_folder_id,
      p_location_id,
      p_location_ids,
      p_start_date,
      p_schedule,
      COALESCE(p_sections, '[]'::jsonb),
      COALESCE(p_time_of_day, 'anytime'),
      p_due_time,
      p_visibility_from,
      p_visibility_until
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time) TO authenticated;
