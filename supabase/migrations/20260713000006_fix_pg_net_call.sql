-- ================================================================
-- Fix pg_net function call in the alert email trigger.
--
-- Supabase updated pg_net and the function now lives in the `net`
-- schema only. The previous trigger called `extensions.net.http_post`
-- which no longer exists; the EXCEPTION block was silently catching
-- the "function does not exist" error, so no HTTP calls were made.
--
-- Also: pass _payload (jsonb) directly instead of _payload::text,
-- matching the actual net.http_post(url, body jsonb, ...) signature.
-- ================================================================

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
  SELECT value INTO _url    FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _secret FROM public.app_config WHERE key = 'alert_secret';

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'send_alert_email: supabase_url not set in app_config table.';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'send_alert_email: alert_secret not set in app_config table.';
    RETURN NEW;
  END IF;

  IF NEW.recipient_email IS NOT NULL AND NEW.recipient_email <> '' THEN
    _recipient := NEW.recipient_email;
  ELSE
    SELECT COALESCE(NULLIF(l.contact_email, ''), NULLIF(l.alert_email, ''))
      INTO _recipient
      FROM public.locations l
     WHERE l.organization_id = NEW.organization_id
       AND COALESCE(NULLIF(l.contact_email, ''), NULLIF(l.alert_email, '')) IS NOT NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

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

  PERFORM net.http_post(
    url     := _url || '/functions/v1/send-alert-email',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-alert-secret', _secret
               ),
    body    := _payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'send_alert_email: pg_net call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Remove duplicate trigger created by an earlier migration run.
DROP TRIGGER IF EXISTS trigger_send_alert_email ON public.alerts;
