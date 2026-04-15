-- ================================================================
-- Add recipient_email to alerts for per-rule email targeting
-- ================================================================
-- Previously the email trigger always looked up the location's
-- contact_email. Now a caller can supply a specific recipient_email
-- on the alert row (e.g. from a checklist "notify" logic rule) and
-- the trigger will use that instead.
--
-- Backwards-compatible: existing rows without recipient_email still
-- fall back to the location contact_email lookup.
-- ================================================================

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS recipient_email text;

-- Update the trigger function to prefer the per-row recipient when set.
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
    RAISE WARNING 'send_alert_email: app.supabase_url not set.';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'send_alert_email: app.alert_secret not set.';
    RETURN NEW;
  END IF;

  -- Use per-row recipient_email when present; otherwise fall back to the
  -- location's contact_email (legacy behaviour for out-of-range alerts).
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
