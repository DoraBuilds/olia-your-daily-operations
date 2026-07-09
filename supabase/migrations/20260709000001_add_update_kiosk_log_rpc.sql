-- ================================================================
-- Add: update_kiosk_log RPC
--
-- Allows the kiosk to overwrite an existing checklist_log row when
-- a staff member re-edits a completed checklist within the same
-- visibility window.  The log_id + location_id pair is validated to
-- prevent one location from tampering with another location's logs.
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_kiosk_log(
  p_log_id             uuid,
  p_location_id        uuid,
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

  -- Verify the log belongs to the claimed location (prevents cross-location tampering)
  IF NOT EXISTS (
    SELECT 1 FROM public.checklist_logs
     WHERE id = p_log_id AND location_id = p_location_id
  ) THEN
    RAISE EXCEPTION 'update_kiosk_log: log % not found for location %.', p_log_id, p_location_id;
  END IF;

  UPDATE public.checklist_logs
     SET score        = p_score::integer,
         answers      = p_answers,
         completed_by = p_completed_by,
         started_at   = COALESCE(p_started_at, started_at)
   WHERE id = p_log_id;

  RETURN p_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kiosk_log(uuid, uuid, numeric, jsonb, text, timestamptz) TO anon;
