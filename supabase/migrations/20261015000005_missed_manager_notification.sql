-- ================================================================
-- Checklist timing, part 4: opt-in manager notification for Missed.
--
-- Each owner / manager chooses for themselves (Account > Notifications) to be
-- emailed when a checklist is recorded as Missed. Owners are told about every
-- location; managers only about the locations they are assigned to.
--
-- A statement-level trigger on checklist_misses batches everything inserted
-- by one statement (the sweep can record several at once) into ONE email per
-- recipient per location, sent through the send-missed-notification edge
-- function with the same app_config url + alert_secret as the other alert
-- emails. A failed send never blocks recording the miss.
-- ================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS notify_missed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.notify_missed_checklists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url    text;
  _secret text;
  r       record;
BEGIN
  SELECT value INTO _url    FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _secret FROM public.app_config WHERE key = 'alert_secret';

  IF _url IS NULL OR _url = '' OR _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'notify_missed_checklists: supabase_url / alert_secret not set in app_config.';
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT
      tm.email          AS recipient_email,
      tm.name           AS recipient_name,
      l.name            AS location_name,
      jsonb_agg(
        jsonb_build_object(
          'title',          n.checklist_title,
          'window_from',    to_char(n.window_from, 'HH24:MI'),
          'window_until',   to_char(n.window_until, 'HH24:MI'),
          'route',          n.route,
          'operating_date', n.operating_date,
          'reason',         n.reason,
          'note',           n.note
        ) ORDER BY n.checklist_title
      )                 AS items
    FROM new_misses n
    JOIN public.locations l ON l.id = n.location_id
    JOIN public.team_members tm
      ON tm.organization_id = n.organization_id
     AND tm.notify_missed = true
     AND tm.archived_at IS NULL
     AND COALESCE(tm.email, '') <> ''
     AND (tm.is_owner OR tm.is_manager)
     AND (tm.is_owner OR n.location_id = ANY(tm.location_ids))
    GROUP BY tm.email, tm.name, l.id, l.name
  LOOP
    PERFORM net.http_post(
      url     := _url || '/functions/v1/send-missed-notification',
      headers := jsonb_build_object(
                   'Content-Type',   'application/json',
                   'x-alert-secret', _secret
                 ),
      body    := jsonb_build_object(
                   'recipient_email', r.recipient_email,
                   'recipient_name',  r.recipient_name,
                   'location_name',   r.location_name,
                   'items',           r.items
                 ),
      timeout_milliseconds := 20000
    );
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_missed_checklists failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_missed_checklists() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_missed_checklists ON public.checklist_misses;

CREATE TRIGGER trg_notify_missed_checklists
  AFTER INSERT ON public.checklist_misses
  REFERENCING NEW TABLE AS new_misses
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notify_missed_checklists();
