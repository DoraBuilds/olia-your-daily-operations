-- ================================================================
-- SEQ-002: Replace permissive anon INSERT policy on alerts with a
--          SECURITY DEFINER RPC that validates inputs server-side.
-- ================================================================
--
-- The previous policy allowed ANY anonymous user to INSERT an alert
-- into ANY organization's feed simply by supplying a non-null
-- organization_id. Because the anon key is embedded in the app
-- bundle, this was effectively unauthenticated write access.
--
-- Fix: drop the permissive policy and expose a tightly-validated
-- SECURITY DEFINER function instead. The function resolves
-- organization_id from a confirmed location row so clients can
-- never spoof a different org.
-- ================================================================

-- 1. Drop the vulnerable policy
DROP POLICY IF EXISTS anon_kiosk_insert_alerts ON public.alerts;

-- 2. Create the secure RPC
CREATE OR REPLACE FUNCTION public.insert_kiosk_alert(
  p_location_id  uuid,
  p_message      text,
  p_type         text,
  p_area         text,
  p_checklist_id uuid     DEFAULT NULL,
  p_recipient_email text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- ── Input validation ──────────────────────────────────────────────────────

  -- type must be one of the three valid values
  IF p_type NOT IN ('info', 'warn', 'error') THEN
    RAISE EXCEPTION 'insert_kiosk_alert: invalid type "%". Must be info, warn, or error.', p_type;
  END IF;

  -- message must be non-empty and within 500 characters
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_message must not be empty.';
  END IF;
  IF length(p_message) > 500 THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_message exceeds 500 characters (got %).', length(p_message);
  END IF;

  -- area must be within 100 characters when supplied
  IF p_area IS NOT NULL AND length(p_area) > 100 THEN
    RAISE EXCEPTION 'insert_kiosk_alert: p_area exceeds 100 characters (got %).', length(p_area);
  END IF;

  -- ── Resolve organization_id server-side ───────────────────────────────────
  SELECT organization_id
    INTO _org_id
    FROM public.locations
   WHERE id = p_location_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'insert_kiosk_alert: location % not found.', p_location_id;
  END IF;

  -- ── Insert the alert ──────────────────────────────────────────────────────
  INSERT INTO public.alerts (
    organization_id,
    type,
    message,
    area,
    time,
    source,
    recipient_email
  ) VALUES (
    _org_id,
    p_type,
    trim(p_message),
    p_area,
    to_char(now() AT TIME ZONE 'UTC', 'HH24:MI'),
    'kiosk',
    p_recipient_email
  );
END;
$$;

-- 3. Allow the anon role to call this function
GRANT EXECUTE ON FUNCTION public.insert_kiosk_alert(uuid, text, text, text, uuid, text) TO anon;
