-- ================================================================
-- Checklist timing, part 2: on-time/late stamps + recorded misses.
--
--  1. checklist_logs.timing_status: 'on_time' | 'late' (NULL = completed
--     before this existed, or the checklist has no due window).
--  2. locations.timezone: IANA zone, learned from the paired kiosk's own
--     heartbeat (first value wins), so the server can tell what local time
--     it is at a location.
--  3. checklist_misses: one row per checklist / location / operating day
--     that was never completed, with the route:
--       window_close  - late completion off, missed when the window closed
--       after_overdue - late completion on, the team had until the day end
--  4. record_missed_checklists(): swept every 10 minutes by pg_cron.
-- ================================================================

-- ── 1. timing stamp on logs ──
ALTER TABLE public.checklist_logs
  ADD COLUMN IF NOT EXISTS timing_status text
  CHECK (timing_status IS NULL OR timing_status IN ('on_time', 'late'));

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
  p_started_at         timestamptz DEFAULT NULL,
  p_timing_status      text        DEFAULT NULL
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
    edit_token,
    timing_status
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
    _edit_token,
    CASE WHEN p_timing_status IN ('on_time', 'late') THEN p_timing_status ELSE NULL END
  )
  RETURNING id INTO _log_id;

  RETURN jsonb_build_object('log_id', _log_id, 'edit_token', _edit_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_kiosk_log(uuid, uuid, uuid, numeric, jsonb, text, text, integer, timestamptz, text) TO anon, authenticated;

-- ── 2. location timezone, learned from the kiosk heartbeat ──
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS timezone text;

DROP FUNCTION IF EXISTS public.touch_kiosk_device(uuid);

CREATE FUNCTION public.touch_kiosk_device(
  p_device_token uuid,
  p_timezone     text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _revoked_at  timestamptz;
  _location_id uuid;
  _tz          text;
BEGIN
  UPDATE public.kiosk_devices
  SET last_seen_at = now()
  WHERE device_token = p_device_token
    AND paired_at IS NOT NULL
  RETURNING revoked_at, location_id INTO _revoked_at, _location_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _revoked_at IS NULL AND p_timezone IS NOT NULL THEN
    SELECT name INTO _tz FROM pg_timezone_names WHERE name = p_timezone LIMIT 1;
    IF _tz IS NOT NULL THEN
      UPDATE public.locations SET timezone = _tz
       WHERE id = _location_id AND timezone IS NULL;
    END IF;
  END IF;

  RETURN _revoked_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_kiosk_device(uuid, text) TO anon, authenticated;

-- ── 3. recorded misses ──
CREATE TABLE IF NOT EXISTS public.checklist_misses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  checklist_id    uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  checklist_title text NOT NULL,
  operating_date  date NOT NULL,
  route           text NOT NULL CHECK (route IN ('window_close', 'after_overdue')),
  window_from     time,
  window_until    time,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, location_id, operating_date)
);

CREATE INDEX IF NOT EXISTS checklist_misses_org_date_idx
  ON public.checklist_misses (organization_id, operating_date DESC);
CREATE INDEX IF NOT EXISTS checklist_misses_location_idx
  ON public.checklist_misses (location_id);

ALTER TABLE public.checklist_misses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_misses_select" ON public.checklist_misses;
CREATE POLICY "checklist_misses_select" ON public.checklist_misses
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_org_id()));

-- ── 4. the sweep ──
-- Mirrors the kiosk's own state logic (getKioskVisibilityState): everything
-- is measured from the start of the location's operating day, which begins at
-- its day_end_time. Only locations with a known timezone are swept, and only
-- operating days from 2026-10-15 onward (no backfill of history).
CREATE OR REPLACE FUNCTION public.record_missed_checklists()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  WITH base AS (
    SELECT
      l.id AS location_id, l.organization_id, l.timezone, l.day_end_time,
      c.id AS checklist_id, c.title, c.allow_late_completion,
      c.visibility_from, c.visibility_until, c.created_at AS checklist_created, c.start_date,
      (now() AT TIME ZONE l.timezone) AS local_now,
      (EXTRACT(HOUR FROM l.day_end_time) * 60 + EXTRACT(MINUTE FROM l.day_end_time))::int AS day_end_min
    FROM public.locations l
    JOIN public.checklists c ON c.organization_id = l.organization_id
    WHERE l.timezone IS NOT NULL
      AND c.is_published = true
      AND (c.visibility_from IS NOT NULL OR c.visibility_until IS NOT NULL)
      AND (
        (c.location_ids IS NULL AND c.concept_id IS NULL)
        OR l.id = ANY(c.location_ids)
        OR c.location_id = l.id
        OR (c.concept_id IS NOT NULL AND c.concept_id = l.concept_id)
      )
  ),
  shifted AS (
    SELECT b.*,
      ((EXTRACT(HOUR FROM b.local_now) * 60 + EXTRACT(MINUTE FROM b.local_now))::int - b.day_end_min + 1440) % 1440 AS now_min,
      CASE WHEN b.visibility_from IS NULL THEN 0
        ELSE ((EXTRACT(HOUR FROM b.visibility_from) * 60 + EXTRACT(MINUTE FROM b.visibility_from))::int - b.day_end_min + 1440) % 1440 END AS start_min,
      CASE WHEN b.visibility_until IS NULL THEN 1439
        ELSE ((EXTRACT(HOUR FROM b.visibility_until) * 60 + EXTRACT(MINUTE FROM b.visibility_until))::int - b.day_end_min + 1440) % 1440 END AS end_min,
      ((b.local_now - b.day_end_time::interval)::date) AS today_op_date
    FROM base b
  ),
  candidates AS (
    SELECT s.*, d.back, (s.today_op_date - d.back) AS op_date,
      CASE WHEN s.start_min <= s.end_min THEN s.now_min > s.end_min
           ELSE (s.now_min > s.end_min AND s.now_min < s.start_min) END AS past_window
    FROM shifted s
    CROSS JOIN (VALUES (0), (1)) AS d(back)
  )
  INSERT INTO public.checklist_misses
    (organization_id, location_id, checklist_id, checklist_title, operating_date, route, window_from, window_until)
  SELECT
    x.organization_id, x.location_id, x.checklist_id, x.title, x.op_date,
    CASE WHEN x.allow_late_completion THEN 'after_overdue' ELSE 'window_close' END,
    x.visibility_from, x.visibility_until
  FROM candidates x
  WHERE x.op_date >= DATE '2026-10-15'
    -- yesterday is over; today is a miss only once a strict window has closed
    AND (x.back = 1 OR (x.past_window AND NOT x.allow_late_completion))
    AND (x.start_date IS NULL OR x.start_date <= x.op_date)
    -- checklist existed before that day's window closed
    AND x.checklist_created <= (
      (x.op_date::timestamp + x.day_end_time::interval + make_interval(mins => x.end_min)) AT TIME ZONE x.timezone
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.checklist_logs cl
       WHERE cl.checklist_id = x.checklist_id
         AND cl.location_id = x.location_id
         AND ((cl.created_at AT TIME ZONE x.timezone) - x.day_end_time::interval)::date = x.op_date
    )
  ON CONFLICT (checklist_id, location_id, operating_date) DO NOTHING;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.record_missed_checklists() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'record-missed-checklists';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'record-missed-checklists',
  '*/10 * * * *',
  $$SELECT public.record_missed_checklists();$$
);
