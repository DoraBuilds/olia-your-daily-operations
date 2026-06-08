-- ================================================================
-- Demo request capture + email notification pipeline
-- ================================================================
-- Landing page visitor submits form → inserts into demo_requests
-- → pg_net trigger → notify-demo-request edge function → Resend → Dora
--
-- REQUIRED ONE-TIME SETUP (run in SQL Editor before deploying):
--
--   ALTER DATABASE postgres
--     SET app.supabase_url = 'https://YOUR_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET app.demo_secret = 'YOUR_RANDOM_SECRET';
--
--   app.supabase_url  → already set if send-alert-email is working
--   app.demo_secret   → any random string, e.g. "olia-demo-2026-xK9m"
--                       Store the same value as DEMO_SECRET in Edge Function secrets.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.demo_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text        NOT NULL,
  venue_name  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Allow unauthenticated landing page visitors to insert
CREATE POLICY "anon can insert demo requests"
  ON public.demo_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Trigger function: fires after each INSERT → pg_net → edge function
CREATE OR REPLACE FUNCTION public.notify_demo_request_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url    text;
  _secret text;
BEGIN
  _url    := current_setting('app.supabase_url', true);
  _secret := current_setting('app.demo_secret', true);

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'notify_demo_request: app.supabase_url not set.';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'notify_demo_request: app.demo_secret not set.';
    RETURN NEW;
  END IF;

  PERFORM extensions.net.http_post(
    url     := _url || '/functions/v1/notify-demo-request',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-demo-secret', _secret
               ),
    body    := jsonb_build_object(
                 'id',         NEW.id,
                 'name',       NEW.name,
                 'email',      NEW.email,
                 'venue_name', NEW.venue_name,
                 'created_at', NEW.created_at
               )::text,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_demo_request: pg_net call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_demo_request ON public.demo_requests;

CREATE TRIGGER trg_notify_demo_request
  AFTER INSERT ON public.demo_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_demo_request_on_insert();
