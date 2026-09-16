-- ================================================================
-- Schedule the checklist notification digest.
--
-- The checklist_notification_rules table and the check-checklist-alerts
-- edge function (20260724000002) were shipped without anything to
-- actually call the function on a schedule -- only the Admin ->
-- Notifications "Test" button invoked it. Owners could enable the daily
-- summary and save a notify_hour, but no email was ever sent
-- automatically.
--
-- Fix: enable pg_cron and call check-checklist-alerts once an hour via
-- pg_net, the same way trg_touch_checklist_notification_rules's sibling
-- (send_alert_email_on_insert, 20260713000006) already calls
-- send-alert-email -- reusing the same app_config-backed supabase_url /
-- alert_secret pair, so no new secret needs to be configured. The edge
-- function treats a request carrying the x-alert-secret header as a
-- sweep: it loads every org with enabled = true and notify_hour equal
-- to the current UTC hour, and sends a digest for each.
--
-- Known limitation: notify_hour has no per-organization timezone, so
-- "8pm" means 20:00 UTC, not the location's local time. There's no
-- timezone data on organizations/locations to base this on yet -- add
-- one before trying to make notify_hour timezone-aware.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_checklist_alerts_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url    text;
  _secret text;
BEGIN
  SELECT value INTO _url    FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _secret FROM public.app_config WHERE key = 'alert_secret';

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'run_checklist_alerts_sweep: supabase_url not set in app_config table.';
    RETURN;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'run_checklist_alerts_sweep: alert_secret not set in app_config table.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/check-checklist-alerts',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-alert-secret', _secret
               ),
    body    := jsonb_build_object('cron', true),
    timeout_milliseconds := 20000
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_checklist_alerts_sweep: pg_net call failed: %', SQLERRM;
END;
$$;

-- Re-runnable: drop any existing job with this name before scheduling,
-- so a local `supabase db reset` (which replays every migration) doesn't
-- error on a duplicate jobname.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-checklist-alerts-hourly';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'check-checklist-alerts-hourly',
  '5 * * * *',
  $$SELECT public.run_checklist_alerts_sweep();$$
);
