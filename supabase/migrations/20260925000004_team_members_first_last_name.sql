-- Team members get separate first/last name fields so the kiosk can greet
-- people by first name ("Hi, Dora") instead of their full name.
--
-- `name` stays the full display name used everywhere else (lists, reporting,
-- answer attribution). A trigger keeps the three columns in sync in both
-- directions:
--   * a write that sets first_name/last_name rebuilds `name`;
--   * a write that only sets `name` (signup bootstrap, Account tab, older
--     clients) splits it into first_name (first word) + last_name (the rest).
-- last_name is optional.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

UPDATE public.team_members
SET first_name = split_part(btrim(name), ' ', 1),
    last_name  = nullif(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), '')
WHERE first_name IS NULL;

CREATE OR REPLACE FUNCTION public.team_members_sync_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND nullif(btrim(NEW.first_name), '') IS NOT NULL
     OR TG_OP = 'UPDATE' AND (NEW.first_name IS DISTINCT FROM OLD.first_name
                              OR NEW.last_name IS DISTINCT FROM OLD.last_name) THEN
    NEW.first_name := btrim(coalesce(NEW.first_name, ''));
    NEW.last_name  := nullif(btrim(coalesce(NEW.last_name, '')), '');
    NEW.name       := btrim(NEW.first_name || ' ' || coalesce(NEW.last_name, ''));
  ELSIF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.first_name := split_part(btrim(NEW.name), ' ', 1);
    NEW.last_name  := nullif(btrim(substr(btrim(NEW.name), length(NEW.first_name) + 1)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_sync_name ON public.team_members;
CREATE TRIGGER team_members_sync_name
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_members_sync_name();

-- ── validate_kiosk_member_pin (latest: 20260924000002) ────────────
-- Same body, plus first_name so the kiosk can greet by first name. The
-- return type changes, so it has to be dropped and recreated.
DROP FUNCTION IF EXISTS public.validate_kiosk_member_pin(text, uuid);

CREATE FUNCTION public.validate_kiosk_member_pin(
  p_pin         text,
  p_location_id uuid
)
RETURNS TABLE (
  id              uuid,
  name            text,
  first_name      text,
  organization_id uuid,
  role            text,
  location_ids    uuid[],
  department_ids  uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recent_failures INT;
  v_org_id          uuid;
  v_member_id       uuid;
BEGIN
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id  = p_location_id
    AND pin_type     = 'member'
    AND succeeded    = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT loc.organization_id INTO v_org_id FROM public.locations loc WHERE loc.id = p_location_id;
  v_member_id := public._find_member_by_pin(v_org_id, p_pin, false);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'member', v_member_id IS NOT NULL);

  IF v_member_id IS NOT NULL THEN
    RETURN QUERY
      SELECT tm.id, tm.name, tm.first_name, tm.organization_id, tm.role,
             coalesce(tm.location_ids, '{}'), coalesce(tm.department_ids, '{}')
      FROM public.team_members tm
      WHERE tm.id = v_member_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_kiosk_member_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_kiosk_member_pin(text, uuid) TO anon, authenticated;
