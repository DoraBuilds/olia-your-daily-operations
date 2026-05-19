-- ================================================================
-- GDPR account deletion
--
-- Provides a self-service delete_my_account() RPC that:
--   1. Resolves the caller's organization via current_org_id()
--   2. Deletes the organization row — ON DELETE CASCADE removes all
--      org-scoped data (locations, team_members, staff_profiles,
--      folders, checklists, checklist_logs, etc.)
--   3. Deletes the caller's row from auth.users
--
-- Only the account owner (the user whose id = auth.uid()) can call
-- this. The client navigates to /signup?reason=account-deleted
-- BEFORE calling signOut so ProtectedRoute does not race.
-- ================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_org_id    UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Not authenticated');
  END IF;

  -- Resolve org — uses the same helper all RLS policies rely on
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'No organisation found');
  END IF;

  -- Cascade deletes all org data (locations, team_members, staff_profiles,
  -- folders, checklists, checklist_logs, team_member_invites, etc.)
  DELETE FROM public.organizations WHERE id = v_org_id;

  -- Remove the auth account — the team_members FK cascade already ran above,
  -- so there is no residual reference to block this delete.
  DELETE FROM auth.users WHERE id = v_caller_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Only authenticated users can invoke this
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
