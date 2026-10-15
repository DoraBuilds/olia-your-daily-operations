-- ================================================================
-- Checklist timing, part 3: missed notes.
--
-- Staff at the kiosk can add an optional quick-pick reason + free text to a
-- Missed checklist (late completion off). One note per miss; it records who
-- wrote it and when. Managers see it next to the miss in reporting (later).
-- ================================================================

ALTER TABLE public.checklist_misses
  ADD COLUMN IF NOT EXISTS reason  text
    CHECK (reason IS NULL OR reason IN ('short_staffed', 'equipment_issue', 'forgot', 'other')),
  ADD COLUMN IF NOT EXISTS note    text,
  ADD COLUMN IF NOT EXISTS note_by text,
  ADD COLUMN IF NOT EXISTS note_at timestamptz;

-- Notes already written for this location's operating day (shown on the
-- kiosk's Missed box). The kiosk supplies the operating date from its own
-- clock + the location's day end, so it matches what the staff see.
CREATE OR REPLACE FUNCTION public.get_kiosk_missed_notes(p_location_id uuid, p_operating_date date)
RETURNS TABLE (
  checklist_id uuid,
  reason       text,
  note         text,
  note_by      text,
  note_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.checklist_id, m.reason, m.note, m.note_by, m.note_at
    FROM public.checklist_misses m
   WHERE m.location_id = p_location_id
     AND m.operating_date = p_operating_date
     AND m.note_at IS NOT NULL
     AND ABS(p_operating_date - CURRENT_DATE) <= 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_kiosk_missed_notes(uuid, date) TO anon, authenticated;

-- Add (or replace) the note on a miss, creating the miss row if the sweep has
-- not recorded it yet. Only checklists with late completion off can be noted
-- (they are the ones the kiosk's Missed box shows), and only by someone in the
-- checklist's department.
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
  _org_id uuid;
  _c      public.checklists%ROWTYPE;
BEGIN
  IF ABS(p_operating_date - CURRENT_DATE) > 1 THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: operating date out of range.';
  END IF;

  IF p_reason IS NOT NULL AND p_reason NOT IN ('short_staffed', 'equipment_issue', 'forgot', 'other') THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: unknown reason.';
  END IF;

  SELECT organization_id INTO _org_id FROM public.locations WHERE id = p_location_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: location not found.';
  END IF;

  SELECT * INTO _c FROM public.checklists
   WHERE id = p_checklist_id AND organization_id = _org_id AND is_published = true;
  IF NOT FOUND OR _c.allow_late_completion THEN
    RAISE EXCEPTION 'add_kiosk_missed_note: checklist cannot be noted.';
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
