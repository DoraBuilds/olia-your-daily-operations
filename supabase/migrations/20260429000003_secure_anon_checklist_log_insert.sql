-- ================================================================
-- SEQ-003: Replace permissive anon INSERT policy on checklist_logs
--          with a SECURITY DEFINER RPC that validates inputs and
--          resolves organization_id server-side.
-- ================================================================
--
-- The previous policy allowed ANY anonymous user to INSERT a row
-- into checklist_logs for ANY organization as long as a non-null
-- staff_profile_id was supplied. Because the anon key is embedded
-- in the app bundle, any caller could fabricate unlimited audit
-- records, destroying operational integrity.
--
-- Fix: drop the permissive policy and expose a tightly-validated
-- SECURITY DEFINER function. The function:
--   • resolves organization_id from a confirmed locations row
--     (clients can never spoof a different org)
--   • verifies staff_profile_id exists in staff_profiles
--   • verifies checklist_id belongs to this location's organization
--   • validates score is in [0, 100]
--   • validates answers is non-null JSONB
-- ================================================================

-- 1. Drop the vulnerable policy
DROP POLICY IF EXISTS "anon_kiosk_insert_logs" ON public.checklist_logs;

-- 2. Create the secure RPC
CREATE OR REPLACE FUNCTION public.submit_kiosk_log(
  p_location_id        uuid,
  p_checklist_id       uuid,
  p_staff_profile_id   uuid,
  p_score              numeric,
  p_answers            jsonb,
  p_checklist_title    text,
  p_completed_by       text       DEFAULT '',
  p_duration_seconds   integer    DEFAULT NULL,
  p_started_at         timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id   uuid;
  _log_id   uuid;
BEGIN
  -- ── Resolve organization_id server-side (never from client) ──────────────
  SELECT organization_id
    INTO _org_id
    FROM public.locations
   WHERE id = p_location_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'submit_kiosk_log: location % not found.', p_location_id;
  END IF;

  -- ── Validate staff_profile_id exists ────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles WHERE id = p_staff_profile_id
  ) THEN
    RAISE EXCEPTION 'submit_kiosk_log: staff_profile_id % not found.', p_staff_profile_id;
  END IF;

  -- ── Validate checklist belongs to this org ───────────────────────────────
  IF NOT EXISTS (
    SELECT 1
      FROM public.checklists
     WHERE id = p_checklist_id
       AND organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'submit_kiosk_log: checklist % does not belong to organization %.', p_checklist_id, _org_id;
  END IF;

  -- ── Validate score range ─────────────────────────────────────────────────
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'submit_kiosk_log: p_score must be between 0 and 100 (got %).', p_score;
  END IF;

  -- ── Validate answers ─────────────────────────────────────────────────────
  IF p_answers IS NULL THEN
    RAISE EXCEPTION 'submit_kiosk_log: p_answers must not be null.';
  END IF;

  -- ── Insert with server-resolved organization_id ──────────────────────────
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

-- 3. Grant execute to anon role (kiosk uses anon key)
GRANT EXECUTE ON FUNCTION public.submit_kiosk_log(uuid, uuid, uuid, numeric, jsonb, text, text, integer, timestamptz) TO anon;
