-- ================================================================
-- Alert emails (#1074):
--  * store the kiosk's IANA timezone so the email shows local time
--  * insert_kiosk_alert only accepts a recipient configured in the
--    organization's checklist notify rules (was: any address, from anon)
-- ================================================================

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS timezone text;

DROP FUNCTION IF EXISTS public.insert_kiosk_alert(uuid, text, text, text, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.insert_kiosk_alert(
  p_location_id     uuid,
  p_message         text,
  p_type            text,
  p_area            text,
  p_checklist_id    uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_question        text DEFAULT NULL,
  p_response        text DEFAULT NULL,
  p_staff_name      text DEFAULT NULL,
  p_timezone        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id   uuid;
  _loc_name text;
  _tz       text;
BEGIN
  IF p_type NOT IN ('info', 'warn', 'error') THEN
    RAISE EXCEPTION 'insert_kiosk_alert: invalid type "%". Must be info, warn, or error.', p_type;
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_message must not be empty.';
  END IF;
  IF length(p_message) > 500 THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_message exceeds 500 characters (got %).', length(p_message);
  END IF;

  IF p_area IS NOT NULL AND length(p_area) > 100 THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_area exceeds 100 characters (got %).', length(p_area);
  END IF;

  IF length(coalesce(p_question, '')) > 500
     OR length(coalesce(p_response, '')) > 500
     OR length(coalesce(p_staff_name, '')) > 200 THEN
    RAISE EXCEPTION 'insert_kiosk_alert: question, response or staff name too long.';
  END IF;

  SELECT organization_id, name
    INTO _org_id, _loc_name
    FROM public.locations
   WHERE id = p_location_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'insert_kiosk_alert: location % not found.', p_location_id;
  END IF;

  -- The recipient is caller-supplied and this RPC is open to anon, so only
  -- accept an address an owner configured in one of this organization's
  -- checklist notify rules. Anything else would make Olia an email relay.
  IF p_recipient_email IS NOT NULL AND trim(p_recipient_email) <> '' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.checklists c
       WHERE c.organization_id = _org_id
         AND position('"' || lower(trim(p_recipient_email)) || '"' IN lower(c.sections::text)) > 0
    ) THEN
      RAISE EXCEPTION 'insert_kiosk_alert: recipient is not configured for this organization.';
    END IF;
  END IF;

  -- Only keep a real IANA zone name; the email falls back to UTC otherwise.
  SELECT name INTO _tz FROM pg_timezone_names WHERE name = p_timezone LIMIT 1;

  INSERT INTO public.alerts (
    organization_id, type, message, area, time, source, recipient_email,
    question_text, response_text, location_name, staff_name, timezone
  ) VALUES (
    _org_id,
    p_type,
    trim(p_message),
    p_area,
    to_char(now() AT TIME ZONE 'UTC', 'HH24:MI'),
    'kiosk',
    p_recipient_email,
    NULLIF(trim(p_question), ''),
    NULLIF(trim(p_response), ''),
    _loc_name,
    NULLIF(trim(p_staff_name), ''),
    _tz
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_kiosk_alert(uuid, text, text, text, uuid, text, text, text, text, text) TO anon, authenticated;

-- Pass the new fields through to the email edge function.
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
    'recipient_email', _recipient,
    'question_text',   NEW.question_text,
    'response_text',   NEW.response_text,
    'location_name',   NEW.location_name,
    'staff_name',      NEW.staff_name,
    'timezone',        NEW.timezone
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
