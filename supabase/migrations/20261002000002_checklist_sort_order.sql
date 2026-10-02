-- Manual ordering for checklists (drag handles in Checklists).
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- reorder_checklists: SECURITY DEFINER for the same reason as save_folder /
-- delete_checklist (table RLS via has_permission has proved unreliable).
-- Assigns sort_order = position in p_ids, only for checklists of the caller's org.
CREATE OR REPLACE FUNCTION public.reorder_checklists(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no organization found';
  END IF;

  IF public.platform_admin_viewing_org() IS NULL AND NOT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
      AND tm.organization_id = v_org_id
      AND (tm.is_owner OR COALESCE((tm.permissions->>'create_edit_checklists')::boolean, false))
  ) THEN
    RAISE EXCEPTION 'You do not have permission to reorder checklists';
  END IF;

  UPDATE checklists c
     SET sort_order = o.ord::integer
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE c.id = o.id AND c.organization_id = v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_checklists(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_checklists(uuid[]) TO authenticated;
