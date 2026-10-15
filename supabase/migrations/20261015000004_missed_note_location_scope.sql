-- ================================================================
-- Harden add_kiosk_missed_note: the checklist must actually be assigned to
-- the location being noted (same targeting rule as get_kiosk_checklists),
-- not merely belong to the same organization. A miss row only makes sense
-- for a checklist that location was expected to do.
-- ================================================================

CREATE OR REPLACE FUNCTION public.add_kiosk_missed_note(
  p_location_id    uuid,
  p_checklist_id   uuid,
  p_operating_date date,
  p_reason         text,
  p_note           text,
  p_by             text,
  p_department_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id     uuid;
  _concept_id uuid;
  _c          public.checklists%ROWTYPE;
BEGIN
  IF ABS(p_operating_date - CURRENT_DATE) > 1 THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: operating date out of range.';
  END IF;

  IF p_reason IS NOT NULL AND p_reason NOT IN ('short_staffed', 'equipment_issue', 'forgot', 'other') THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: unknown reason.';
  END IF;

  SELECT organization_id, concept_id INTO _org_id, _concept_id
    FROM public.locations WHERE id = p_location_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: location not found.';
  END IF;

  SELECT * INTO _c FROM public.checklists
   WHERE id = p_checklist_id AND organization_id = _org_id AND is_published = true;
  IF NOT FOUND OR _c.allow_late_completion
     OR (_c.visibility_from IS NULL AND _c.visibility_until IS NULL) THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: checklist cannot be noted.';
  END IF;

  -- Assigned to this location (mirrors get_kiosk_checklists targeting).
  -- IS NOT TRUE, not NOT (...): a NULL anywhere in the OR chain (e.g. a NULL
  -- location_id) would otherwise make the whole check NULL and let it pass.
  IF (
    (_c.location_ids IS NULL AND _c.concept_id IS NULL)
    OR p_location_id = ANY(_c.location_ids)
    OR _c.location_id = p_location_id
    OR (_c.concept_id IS NOT NULL AND _c.concept_id = _concept_id)
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: checklist is not assigned to this location.';
  END IF;

  IF _c.department_ids IS NOT NULL
     AND NOT (COALESCE(p_department_ids, ARRAY[]::uuid[]) && _c.department_ids) THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: only staff in the checklist''s department can add a note.';
  END IF;

  INSERT INTO public.checklist_misses (
    organization_id, location_id, checklist_id, checklist_title, operating_date,
    route, window_from, window_until, reason, note, note_by, note_at
  ) VALUES (
    _org_id, p_location_id, p_checklist_id, _c.title, p_operating_date,
    'window_close', _c.visibility_from, _c.visibility_until,
    p_reason, NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''), left(COALESCE(p_by, ''), 200), now()
  )
  ON CONFLICT (checklist_id, location_id, operating_date) DO UPDATE
    SET reason  = EXCLUDED.reason,
        note    = EXCLUDED.note,
        note_by = EXCLUDED.note_by,
        note_at = EXCLUDED.note_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_kiosk_missed_note(uuid, uuid, date, text, text, text, uuid[]) TO anon, authenticated;
