-- save_folder RPC
--
-- Creating/renaming a checklist folder went straight to the folders table, whose
-- INSERT/UPDATE RLS policies call has_permission('create_edit_checklists').
-- That helper has proved unreliable under the authenticated role (same root cause
-- as save_checklist / delete_checklist), so folder creation failed silently.
-- This SECURITY DEFINER function does its own explicit membership check.
--
-- Authorization: caller must be an owner or hold create_edit_checklists in their
-- own organization; a folder id, if given, must belong to that organization.

CREATE OR REPLACE FUNCTION public.save_folder(
  p_id uuid,
  p_name text,
  p_parent_id uuid,
  p_location_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_id uuid;
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

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Folder name is required';
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM folders WHERE id = p_parent_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Parent folder not found in your organization';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO folders (organization_id, name, parent_id, location_id)
    VALUES (v_org_id, btrim(p_name), p_parent_id, p_location_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE folders
       SET name = btrim(p_name), parent_id = p_parent_id, location_id = p_location_id
     WHERE id = p_id AND organization_id = v_org_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Folder not found in your organization';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_folder(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_folder(uuid, text, uuid, uuid) TO authenticated;
