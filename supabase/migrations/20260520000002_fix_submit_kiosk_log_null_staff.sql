-- ================================================================
-- Fix: submit_kiosk_log staff_profile_id validation must allow NULL.
--
-- Problem:
--   The validation block raised an exception whenever staff_profile_id
--   was not found in staff_profiles.  When id = NULL the EXISTS check
--   returns false (NULL never matches), so any submission where the
--   kiosk user authenticated via an admin PIN (no staff profile) was
--   immediately rejected with "staff_profile_id <NULL> not found."
--
--   staff_profile_id is intentionally nullable in checklist_logs —
--   admins who enter their team-member PIN have no staff_profiles row.
--
-- Fix: only run the EXISTS check when p_staff_profile_id IS NOT NULL.
-- ================================================================

CREATE OR REPLACE FUNCTION public.submit_kiosk_log(
  p_location_id        uuid,
  p_checklist_id       uuid,
  p_staff_profile_id   uuid,
  p_score              numeric,
  p_answers            jsonb,
  p_checklist_title    text,
  p_completed_by       text        DEFAULT '',
  p_duration_seconds   integer     DEFAULT NULL,
  p_started_at         timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id  uuid;
  _log_id  uuid;
BEGIN
  SELECT organization_id INTO _org_id
    FROM public.locations
   WHERE id = p_location_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'submit_kiosk_log: location % not found.', p_location_id;
  END IF;

  -- Only validate when a staff profile ID is actually provided
  IF p_staff_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_profiles WHERE id = p_staff_profile_id
  ) THEN
    RAISE EXCEPTION 'submit_kiosk_log: staff_profile_id % not found.', p_staff_profile_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.checklists
     WHERE id = p_checklist_id AND organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'submit_kiosk_log: checklist % does not belong to organization %.', p_checklist_id, _org_id;
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'submit_kiosk_log: p_score must be between 0 and 100 (got %).', p_score;
  END IF;

  IF p_answers IS NULL THEN
    RAISE EXCEPTION 'submit_kiosk_log: p_answers must not be null.';
  END IF;

  INSERT INTO public.checklist_logs (
    organization_id,
    checklist_id,
    checklist_title,
    completed_by,
    staff_profile_id,
    score,
    answers,
    location_id,
    started_at
  ) VALUES (
    _org_id,
    p_checklist_id,
    p_checklist_title,
    p_completed_by,
    p_staff_profile_id,
    p_score::integer,
    p_answers,
    p_location_id,
    p_started_at
  )
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_kiosk_log(uuid, uuid, uuid, numeric, jsonb, text, text, integer, timestamptz) TO anon;
