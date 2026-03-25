-- ================================================================
-- Email notification pipeline for alerts (secure shared-secret)
-- ================================================================
-- Postgres trigger → pg_net HTTP POST → Edge Function → Resend API
--
-- REQUIRED ONE-TIME SETUP (run separately in SQL Editor FIRST):
--
--   ALTER DATABASE postgres
--     SET app.supabase_url = 'https://YOUR_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET app.alert_secret = 'YOUR_RANDOM_SECRET';
--
--   app.supabase_url  → Supabase Dashboard → Settings → API → Project URL
--   app.alert_secret  → any random string you invent, e.g. "olia-alerts-2026-xK9m"
--                       Store the same value as the ALERT_SECRET Edge Function secret.
--
-- No service_role key is stored anywhere in the database.
-- ================================================================

-- Enable pg_net (built into Supabase, no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Trigger function
-- SECURITY DEFINER: runs as postgres user so it can read locations.alert_email
-- regardless of who inserted the alert (the anon role in the kiosk case).
CREATE OR REPLACE FUNCTION public.send_alert_email_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url       text;
  _secret    text;
  _recipient text;
  _payload   jsonb;
BEGIN
  -- Read the two non-sensitive config values from DB settings.
  -- 'true' = return NULL instead of raising an error if the setting is missing.
  _url    := current_setting('app.supabase_url', true);
  _secret := current_setting('app.alert_secret', true);

  -- If either is missing, log a warning and bail out.
  -- The alert row is already committed — only the email is skipped.
  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'send_alert_email: app.supabase_url not set. Run: ALTER DATABASE postgres SET app.supabase_url = ''https://YOUR_REF.supabase.co'';';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'send_alert_email: app.alert_secret not set. Run: ALTER DATABASE postgres SET app.alert_secret = ''your-secret'';';
    RETURN NEW;
  END IF;

  -- Look up the alert recipient email from the location assigned to this org.
  -- locations.alert_email exists in the initial schema (20260304000001 line 28).
  SELECT l.alert_email
    INTO _recipient
    FROM public.locations l
   WHERE l.organization_id = NEW.organization_id
     AND l.alert_email IS NOT NULL
     AND l.alert_email <> ''
   ORDER BY l.created_at
   LIMIT 1;

  -- No recipient configured for this org → skip quietly.
  IF _recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build the JSON body for the Edge Function.
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

  -- Fire the HTTP request asynchronously.
  -- pg_net does NOT block the INSERT — the email is sent in the background.
  -- Security: authenticated only by the shared x-alert-secret header.
  -- No Supabase credentials are transmitted.
  PERFORM extensions.net.http_post(
    url     := _url || '/functions/v1/send-alert-email',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-alert-secret', _secret
               ),
    body    := _payload::text,
    timeout_milliseconds := 5000
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never let a trigger error roll back the alert INSERT.
  RAISE WARNING 'send_alert_email: pg_net call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Attach trigger (safe to run multiple times)
DROP TRIGGER IF EXISTS trg_send_alert_email ON public.alerts;

CREATE TRIGGER trg_send_alert_email
  AFTER INSERT ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.send_alert_email_on_insert();
