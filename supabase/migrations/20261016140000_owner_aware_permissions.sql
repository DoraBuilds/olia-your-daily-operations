-- Owners always hold every permission.
--
-- has_permission() read only the team_members.permissions flags and ignored
-- is_owner, so an owner whose flags were false/missing (invited or converted
-- accounts) was silently blocked by every RLS policy that calls it
-- (folders, locations, alerts, staff_profiles, ...). Owners now pass.
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.platform_admin_viewing_org() IS NOT NULL THEN true
    ELSE COALESCE((
      SELECT tm.is_owner OR COALESCE((tm.permissions->>perm)::boolean, false)
      FROM team_members tm
      WHERE tm.id = auth.uid() OR tm.auth_user_id = auth.uid()
      LIMIT 1
    ), false)
  END
$$;

-- reorder_folders: SECURITY DEFINER like save_folder / reorder_checklists, and it
-- raises on missing permission instead of silently updating 0 rows.
CREATE OR REPLACE FUNCTION public.reorder_folders(p_ids uuid[])
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
    RAISE EXCEPTION 'You do not have permission to reorder folders';
  END IF;

  UPDATE folders f
     SET sort_order = (o.ord - 1)::integer
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE f.id = o.id AND f.organization_id = v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_folders(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_folders(uuid[]) TO authenticated;
