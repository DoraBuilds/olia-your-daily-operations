-- ================================================================
-- Use the current location contact email for operational alert delivery
-- ================================================================
-- The app now stores editable location emails in locations.contact_email.
-- Keep a fallback to legacy locations.alert_email for older rows so
-- existing tenants do not lose alert delivery during the transition.

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
  _url    := current_setting('app.supabase_url', true);
  _secret := current_setting('app.alert_secret', true);

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'send_alert_email: app.supabase_url not set. Run: ALTER DATABASE postgres SET app.supabase_url = ''https://YOUR_REF.supabase.co'';';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'send_alert_email: app.alert_secret not set. Run: ALTER DATABASE postgres SET app.alert_secret = ''your-secret'';';
    RETURN NEW;
  END IF;

  -- Prefer the current editable contact email field, but fall back to the
  -- legacy alert_email column for older rows that have not been backfilled.
  SELECT COALESCE(NULLIF(l.contact_email, ''), NULLIF(l.alert_email, ''))
    INTO _recipient
    FROM public.locations l
   WHERE l.organization_id = NEW.organization_id
     AND COALESCE(NULLIF(l.contact_email, ''), NULLIF(l.alert_email, '')) IS NOT NULL
   ORDER BY l.created_at
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
                 'Content-Type',   'application/json',
                 'x-alert-secret', _secret
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
