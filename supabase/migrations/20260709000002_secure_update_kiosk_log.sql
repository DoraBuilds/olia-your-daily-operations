-- ================================================================
-- Secure update_kiosk_log with an edit_token proof-of-possession.
--
-- Problem with the previous approach:
--   update_kiosk_log validated ownership via client-supplied
--   (p_log_id, p_location_id).  Both values are UUIDs that an
--   anonymous caller could supply — anyone who learned both could
--   tamper with any log entry (IDOR).
--
-- Fix:
--   1. Add edit_token (random uuid) to checklist_logs — generated
--      server-side on INSERT, never stored on the client beyond the
--      in-memory kiosk session.
--   2. submit_kiosk_log now returns jsonb {log_id, edit_token} so
--      the originating kiosk session can hold the token in memory.
--   3. update_kiosk_log accepts p_edit_token instead of p_location_id.
--      The WHERE clause binds on both id AND edit_token — possession
--      of the token proves the caller is the original submitter.
--   4. p_completed_by is clamped to 500 chars to prevent oversized
--      payloads from appearing in reporting exports.
-- ================================================================

-- 1. Add edit_token column (existing rows get random tokens, which is
--    fine — they pre-date the re-edit feature and cannot be updated).
ALTER TABLE public.checklist_logs
  ADD COLUMN IF NOT EXISTS edit_token uuid NOT NULL DEFAULT gen_random_uuid();

-- 2. Replace submit_kiosk_log to return jsonb {log_id, edit_token}.
--    Must DROP first because PostgreSQL disallows changing return type
--    via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.submit_kiosk_log(uuid, uuid, uuid, numeric, jsonb, text, text, integer, timestamptz);

CREATE FUNCTION public.submit_kiosk_log(
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id     uuid;
  _log_id     uuid;
  _edit_token uuid;
BEGIN
  SELECT organization_id INTO _org_id
    FROM public.locations
   WHERE id = p_location_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'submit_kiosk_log: location % not found.', p_location_id;
  END IF;

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

  _edit_token := gen_random_uuid();

  INSERT INTO public.checklist_logs (
    organization_id,
    checklist_id,
    checklist_title,
    completed_by,
    staff_profile_id,
    score,
    answers,
    location_id,
    started_at,
    edit_token
  ) VALUES (
    _org_id,
    p_checklist_id,
    p_checklist_title,
    left(p_completed_by, 500),
    p_staff_profile_id,
    p_score::integer,
    p_answers,
    p_location_id,
    p_started_at,
    _edit_token
  )
  RETURNING id INTO _log_id;

  RETURN jsonb_build_object('log_id', _log_id, 'edit_token', _edit_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_kiosk_log(uuid, uuid, uuid, numeric, jsonb, text, text, integer, timestamptz) TO anon;

-- 3. Replace update_kiosk_log to use edit_token instead of location_id.
DROP FUNCTION IF EXISTS public.update_kiosk_log(uuid, uuid, numeric, jsonb, text, timestamptz);

CREATE FUNCTION public.update_kiosk_log(
  p_log_id             uuid,
  p_edit_token         uuid,
  p_score              numeric,
  p_answers            jsonb,
  p_completed_by       text        DEFAULT '',
  p_started_at         timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'update_kiosk_log: p_score must be between 0 and 100 (got %).', p_score;
  END IF;

  IF p_answers IS NULL THEN
    RAISE EXCEPTION 'update_kiosk_log: p_answers must not be null.';
  END IF;

  -- Proof-of-possession: only the kiosk session that created the log
  -- knows the edit_token — it is never stored client-side beyond memory.
  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_logs
     WHERE id = p_log_id AND edit_token = p_edit_token
  ) THEN
    RAISE EXCEPTION 'update_kiosk_log: invalid log_id or edit_token.';
  END IF;

  UPDATE public.checklist_logs
     SET score        = p_score::integer,
         answers      = p_answers,
         completed_by = left(p_completed_by, 500),
         started_at   = COALESCE(p_started_at, started_at)
   WHERE id = p_log_id;

  RETURN p_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kiosk_log(uuid, uuid, numeric, jsonb, text, timestamptz) TO anon;
