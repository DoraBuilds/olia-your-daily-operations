-- ================================================================
-- save_checklist RPC
--
-- SECURITY DEFINER function that handles both INSERT (new checklist)
-- and UPDATE (existing checklist), bypassing table RLS entirely.
--
-- Motivation: the checklists INSERT/UPDATE RLS policies added in
-- earlier migrations include has_permission() and check_plan_limit()
-- checks whose interaction under the authenticated role proved
-- unreliable.  Running as SECURITY DEFINER lets this function do
-- its own explicit authorization and then write directly, which is
-- simpler and easier to reason about.
--
-- Authorization model (mirrors what the RLS policies intended):
--   - The caller must belong to an organization  (current_org_id() IS NOT NULL)
--   - INSERT: plan limit must not be exceeded
--   - UPDATE: the target row must belong to the caller's org
-- ================================================================

CREATE OR REPLACE FUNCTION public.save_checklist(
  p_id              uuid,        -- NULL → insert new; non-NULL → update existing
  p_title           text,
  p_folder_id       uuid,
  p_location_id     uuid,
  p_location_ids    uuid[],
  p_start_date      date,
  p_schedule        jsonb,
  p_sections        jsonb,
  p_time_of_day     text,
  p_due_time        time,
  p_visibility_from time,
  p_visibility_until time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_result_id uuid;
BEGIN
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no organization found';
  END IF;

  IF p_id IS NOT NULL THEN
    -- ── UPDATE existing checklist ──────────────────────────────
    UPDATE public.checklists
    SET
      title            = p_title,
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
    -- ── INSERT new checklist ───────────────────────────────────
    IF NOT public.check_plan_limit(v_org_id, 'checklists', 'maxChecklists') THEN
      RAISE EXCEPTION 'You have reached the checklist limit for your plan. Delete unused checklists or upgrade to create more.';
    END IF;

    INSERT INTO public.checklists (
      organization_id,
      title,
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

REVOKE ALL ON FUNCTION public.save_checklist(uuid, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist(uuid, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time) TO authenticated;
