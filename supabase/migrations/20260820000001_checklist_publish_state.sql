-- ================================================================
-- Add Draft/Live publish state for checklists.
--
-- Checklists can now exist in the Checklists tab without appearing
-- on the kiosk until explicitly published. All existing checklists
-- are backfilled to published (true) so nothing currently visible
-- on kiosk disappears; the app defaults NEW checklists to draft
-- (false) at the UI layer.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN is_published boolean NOT NULL DEFAULT true;

-- ── save_checklist: accept p_is_published (append-only, defaulted, so a
--    stale cached frontend mid-deploy that omits it keeps prior behavior) ──
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
  p_visibility_until time    DEFAULT NULL,
  p_is_published     boolean DEFAULT true
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
      is_published     = p_is_published,
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
      visibility_until,
      is_published
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
      p_visibility_until,
      p_is_published
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean) TO authenticated;

-- ── get_kiosk_checklists: only surface published checklists ──
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
       AND c.is_published = true
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
       AND c.is_published = true
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
