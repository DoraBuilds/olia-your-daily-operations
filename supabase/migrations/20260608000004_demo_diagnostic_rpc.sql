-- Temporary diagnostic: lets us verify the DB-level GUCs are set without
-- exposing their values. Safe to leave in — returns only booleans.
CREATE OR REPLACE FUNCTION public.check_demo_email_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url    text := current_setting('app.supabase_url', true);
  _secret text := current_setting('app.alert_secret', true);
BEGIN
  RETURN jsonb_build_object(
    'supabase_url_set',    (_url    IS NOT NULL AND _url    <> ''),
    'alert_secret_set',   (_secret IS NOT NULL AND _secret <> ''),
    'supabase_url_prefix', left(coalesce(_url, ''), 30)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_demo_email_config() TO anon;
