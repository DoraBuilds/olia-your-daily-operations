-- Info Hub: invited managers can create and edit content (#925).
--
-- infohub_can_manage_content (the check behind every Info Hub insert /
-- update / delete policy) only matched team_members.id = auth.uid().
-- Managers who joined through an invite log in with a separate id
-- (auth_user_id), so they failed it even with the right permissions.
-- Now matches either, like current_org_id() and — since 20260925000005 —
-- infohub_scope_allows. Body otherwise unchanged from 20260915000003.

CREATE OR REPLACE FUNCTION infohub_can_manage_content(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
      AND tm.organization_id = p_org_id
      AND (
        tm.is_owner
        OR COALESCE((tm.permissions->>'create_edit_checklists')::boolean, false)
        OR COALESCE((tm.permissions->>'manage_staff_profiles')::boolean, false)
      )
  );
$$;
