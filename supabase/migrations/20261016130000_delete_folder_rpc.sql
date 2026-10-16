-- delete_folder RPC + owner-aware delete_checklist
--
-- Deleting a checklist folder went straight to the folders table, whose DELETE
-- RLS policy calls has_permission('create_edit_checklists'). That helper does not
-- treat owners specially and has proved unreliable under the authenticated role,
-- so for some owners the delete matched 0 rows and "succeeded" silently.
-- Same fix as save_folder / reorder_checklists: SECURITY DEFINER with an explicit
-- check that the caller is an owner or holds create_edit_checklists.
-- delete_checklist gets the same owner-aware check.

CREATE OR REPLACE FUNCTION public.delete_folder(p_id uuid)
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
    RAISE EXCEPTION 'You do not have permission to manage checklist folders';
  END IF;

  DELETE FROM public.folders WHERE id = p_id AND organization_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found or does not belong to your organization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_folder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_folder(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_checklist(p_id uuid)
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
    RAISE EXCEPTION 'Insufficient permissions to delete checklists';
  END IF;

  DELETE FROM public.checklists WHERE id = p_id AND organization_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist not found or does not belong to your organization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_checklist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_checklist(uuid) TO authenticated;
