-- ================================================================
-- Email notification pipeline for alerts
-- ================================================================
-- Creates a Postgres trigger that calls the send-alert-email
-- Edge Function via pg_net whenever a new alert row is inserted.
--
-- REQUIRED SETUP (run once in Supabase SQL Editor — not part of
-- automated migration):
--
--   ALTER DATABASE postgres
--     SET app.supabase_url     = 'https://YOUR_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET app.service_role_key = 'eyJ...YOUR_SERVICE_ROLE_KEY';
--
-- These values live in Supabase Dashboard → Settings → API.
-- ================================================================

-- Enable pg_net (no-op if already enabled — safe to run twice)
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Trigger function: looks up locations.alert_email, then calls
-- the edge function asynchronously via pg_net.http_post.
-- SECURITY DEFINER: runs as the function owner (postgres),
-- bypassing RLS so it can read locations regardless of who
-- inserted the alert.
CREATE OR REPLACE FUNCTION public.send_alert_email_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url          text;
  _key          text;
  _recipient    text;
  _payload      jsonb;
BEGIN
  _url := current_setting('app.supabase_url',     true);
  _key := current_setting('app.service_role_key', true);

  IF _url IS NULL OR _url = '' OR _key IS NULL OR _key = '' THEN
    RAISE WARNING 'send_alert_email: app.supabase_url or app.service_role_key not configured';
    RETURN NEW;
  END IF;

  SELECT l.alert_email
    INTO _recipient
    FROM public.locations l
   WHERE l.organization_id = NEW.organization_id
     AND l.alert_email IS NOT NULL
     AND l.alert_email <> ''
   LIMIT 1;

  IF _recipient IS NULL THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'id',              NEW.id,
    'type',            NEW.type,
    'message',         NEW.message,
    'area',            NEW.area,
    'time',            NEW.time,
    'source',          NEW.source,
    'created_at',      NEW.created_at,
    'organization_id', NEW.organization_id,
    'recipient_email', _recipient
  );

  PERFORM extensions.net.http_post(
    url     := _url || '/functions/v1/send-alert-email',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _key
               ),
    body    := _payload::text,
    timeout_milliseconds := 5000
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'send_alert_email: pg_net call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_alert_email ON public.alerts;

CREATE TRIGGER trg_send_alert_email
  AFTER INSERT ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.send_alert_email_on_insert();
