-- ================================================================
-- Checklist concept scoping (#792).
--
-- "Applies to all locations" previously always meant every location in the
-- whole org, even when the creator had a specific Concept selected in the
-- sidebar filter. Add a nullable concept_id so "all locations" saved while a
-- concept is active means "all locations in that concept" — and keeps
-- meaning that dynamically as locations are added/removed from the concept,
-- the same way NULL location_id/location_ids already means "all locations,
-- dynamically" org-wide.
--
-- concept_id is mutually exclusive with location_id/location_ids: it only
-- describes the "all locations" case at a narrower level. If specific
-- locations are targeted, concept_id is redundant and is cleared by the
-- trigger below.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS checklists_concept_id_idx ON public.checklists (concept_id);

-- ── 1. Extend the org-target guard trigger to validate + normalize concept_id ──
CREATE OR REPLACE FUNCTION public.validate_checklist_targets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invalid_target_id uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;

  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE l.id = NEW.location_id
      AND l.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Checklist location does not belong to the current organization.';
  END IF;

  IF NEW.location_ids IS NOT NULL THEN
    SELECT requested_id
    INTO invalid_target_id
    FROM unnest(NEW.location_ids) AS requested_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = requested_id
        AND l.organization_id = NEW.organization_id
    )
    LIMIT 1;

    IF invalid_target_id IS NOT NULL THEN
      RAISE EXCEPTION 'Checklist locations do not belong to the current organization.';
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(requested_id ORDER BY requested_id)
    END
    INTO NEW.location_ids
    FROM (
      SELECT DISTINCT requested_id
      FROM unnest(NEW.location_ids) AS requested_id
    ) deduped_targets;
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    IF NEW.location_ids IS NULL THEN
      NEW.location_ids := ARRAY[NEW.location_id];
    ELSIF NOT (NEW.location_id = ANY(NEW.location_ids)) THEN
      NEW.location_ids := array_append(NEW.location_ids, NEW.location_id);
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(target_id ORDER BY target_id)
    END
    INTO NEW.location_ids
    FROM (
      SELECT DISTINCT target_id
      FROM unnest(NEW.location_ids) AS target_id
    ) deduped_targets;
  ELSIF COALESCE(array_length(NEW.location_ids, 1), 0) = 1 THEN
    NEW.location_id := NEW.location_ids[1];
  END IF;

  IF COALESCE(array_length(NEW.location_ids, 1), 0) = 0 THEN
    NEW.location_ids := NULL;
  END IF;

  -- department_ids: a department belongs to a location, so "belongs to this
  -- org" means "belongs to one of this org's locations" (no direct
  -- organization_id column on departments).
  IF NEW.department_ids IS NOT NULL THEN
    SELECT requested_id
    INTO invalid_target_id
    FROM unnest(NEW.department_ids) AS requested_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.departments d
      JOIN public.locations l ON l.id = d.location_id
      WHERE d.id = requested_id
        AND l.organization_id = NEW.organization_id
    )
    LIMIT 1;

    IF invalid_target_id IS NOT NULL THEN
      RAISE EXCEPTION 'Checklist departments do not belong to the current organization.';
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(requested_id ORDER BY requested_id)
    END
    INTO NEW.department_ids
    FROM (
      SELECT DISTINCT requested_id
      FROM unnest(NEW.department_ids) AS requested_id
    ) deduped_targets;
  END IF;

  -- concept_id: only meaningful for "all locations" checklists. Explicit
  -- location targeting makes it redundant/ambiguous, so clear it rather than
  -- reject the write.
  IF NEW.location_id IS NOT NULL OR NEW.location_ids IS NOT NULL THEN
    NEW.concept_id := NULL;
  END IF;

  IF NEW.concept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.concepts co
    WHERE co.id = NEW.concept_id
      AND co.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Checklist concept does not belong to the current organization.';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. save_checklist: accept p_concept_id (append-only, defaulted, so a
--    stale cached frontend mid-deploy that omits it keeps prior behavior) ──
DROP FUNCTION IF EXISTS public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[]);

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
  p_is_published     boolean DEFAULT true,
  p_department_ids   uuid[]  DEFAULT NULL,
  p_concept_id       uuid    DEFAULT NULL
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
      concept_id       = p_concept_id,
      start_date       = p_start_date,
      schedule         = p_schedule,
      sections         = p_sections,
      time_of_day      = COALESCE(p_time_of_day, 'anytime'),
      due_time         = p_due_time,
      visibility_from  = p_visibility_from,
      visibility_until = p_visibility_until,
      is_published     = p_is_published,
      department_ids   = p_department_ids,
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
      concept_id,
      start_date,
      schedule,
      sections,
      time_of_day,
      due_time,
      visibility_from,
      visibility_until,
      is_published,
      department_ids
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
      p_department_ids
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist(uuid, text, text, uuid, uuid, uuid[], date, jsonb, jsonb, text, time, time, time, boolean, uuid[], uuid) TO authenticated;

-- ── 3. get_kiosk_checklists: also match checklists concept-scoped to the
--    target location's own concept ──
DROP FUNCTION IF EXISTS public.get_kiosk_checklists(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_kiosk_checklists(p_location_id uuid, p_department_ids uuid[] DEFAULT NULL)
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
        c.sections
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
