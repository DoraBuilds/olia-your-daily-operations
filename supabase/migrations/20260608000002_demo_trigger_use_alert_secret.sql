-- Replace the demo request trigger function to reuse app.alert_secret
-- (already set on the DB for the send-alert-email pipeline).
-- The edge function verifies against ALERT_SECRET, which is already
-- stored as an edge function secret.
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
  _secret := current_setting('app.alert_secret', true);

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'notify_demo_request: app.supabase_url not set.';
    RETURN NEW;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RAISE WARNING 'notify_demo_request: app.alert_secret not set.';
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
