-- Forward every new waitlist signup to a webhook (a Google Apps Script web app
-- that appends a sheet row and emails the owner; see docs/waitlist-sheet-setup.md).
--
-- The URL lives in public.app_config under 'waitlist_webhook_url' (the table is
-- not readable by API roles). If it's unset, or the HTTP call fails for any
-- reason, we only RAISE WARNING: the visitor's insert must never fail or block.
-- Duplicates never reach this trigger (the unique index rejects them first).

CREATE OR REPLACE FUNCTION public.notify_waitlist_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text;
BEGIN
  SELECT value INTO _url FROM public.app_config WHERE key = 'waitlist_webhook_url';

  IF _url IS NULL OR _url = '' THEN
    RAISE WARNING 'notify_waitlist_signup: waitlist_webhook_url not set in app_config table.';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'email',      NEW.email,
                 'created_at', NEW.created_at,
                 'source',     NEW.source
               ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_waitlist_signup: pg_net call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_waitlist_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS waitlist_signups_notify ON public.waitlist_signups;
CREATE TRIGGER waitlist_signups_notify
  AFTER INSERT ON public.waitlist_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_waitlist_signup();
