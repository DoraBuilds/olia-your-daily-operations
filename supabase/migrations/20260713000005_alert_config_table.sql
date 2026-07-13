-- ================================================================
-- Replace GUC-based config with a config table.
--
-- Supabase hosted projects do not allow ALTER DATABASE SET for custom
-- GUC parameters, so app.supabase_url and app.alert_secret can never
-- be set that way. The trigger function silently bailed out on every
-- alert insert because current_setting() always returned empty.
--
-- Fix: store the two values in a locked-down config table and update
-- the trigger to SELECT from it. The trigger is SECURITY DEFINER so
-- it runs as its owner (postgres) which bypasses RLS and can read the
-- table regardless of the policies applied to API roles.
-- ================================================================

-- 1. Config table — visible only to the trigger (postgres/superuser).
--    API roles (anon, authenticated, service_role) are denied SELECT.
CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies: all API-role access is implicitly denied when RLS is on.

REVOKE ALL ON public.app_config FROM anon, authenticated, service_role;

-- 2. Seed the two values the alert trigger needs.
-- Seed the project URL (not secret — already in .env.prod and public).
-- The alert_secret is NOT seeded here; it must be set by an operator after deploy:
--   UPDATE public.app_config SET value = '<your-secret>' WHERE key = 'alert_secret';
-- The same value must be set as the ALERT_SECRET edge function secret in Supabase.
INSERT INTO public.app_config (key, value) VALUES
  ('supabase_url', 'https://xdhejmnjhjlgcboawmnu.supabase.co'),
  ('alert_secret', 'replace-me')
ON CONFLICT (key) DO NOTHING;

-- 3. Rebuild the trigger function to read from the table instead of GUCs.
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
  -- Read config from the table (SECURITY DEFINER → runs as postgres → bypasses RLS).
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
