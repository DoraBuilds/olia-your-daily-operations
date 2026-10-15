-- ================================================================
-- Checklist timing, part 5: managers add / edit a missed note from Reporting.
--
-- Misses where late completion was allowed never show in the kiosk's Missed
-- box, so nobody on shift could explain them. An owner, or a manager with
-- View reporting at that location, can add the note afterwards.
-- ================================================================

CREATE OR REPLACE FUNCTION public.set_missed_note(
  p_miss_id uuid,
  p_reason  text,
  p_note    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid := public.current_org_id();
  _me     public.team_members%ROWTYPE;
  _miss   public.checklist_misses%ROWTYPE;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'set_missed_note: not authenticated.';
  END IF;

  IF p_reason IS NOT NULL AND p_reason NOT IN ('short_staffed', 'equipment_issue', 'forgot', 'other') THEN
    RAISE EXCEPTION 'set_missed_note: unknown reason.';
  END IF;

  SELECT * INTO _me FROM public.team_members
   WHERE (id = auth.uid() OR auth_user_id = auth.uid()) AND organization_id = _org_id
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_missed_note: no team member for this login.';
  END IF;

  SELECT * INTO _miss FROM public.checklist_misses
   WHERE id = p_miss_id AND organization_id = _org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_missed_note: miss not found.';
  END IF;

  IF NOT _me.is_owner THEN
    IF NOT _me.is_manager
       OR COALESCE((_me.permissions ->> 'view_reporting')::boolean, false) IS NOT TRUE
       OR _miss.location_id <> ALL (COALESCE(_me.location_ids, ARRAY[]::uuid[])) THEN
      RAISE EXCEPTION 'set_missed_note: not allowed.';
    END IF;
  END IF;

  UPDATE public.checklist_misses
     SET reason  = p_reason,
         note    = NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''),
         note_by = left(COALESCE(_me.name, ''), 200),
         note_at = now()
   WHERE id = p_miss_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_missed_note(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_missed_note(uuid, text, text) TO authenticated;
