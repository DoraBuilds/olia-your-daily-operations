-- ================================================================
-- Restore permission check in delete_checklist RPC.
--
-- The initial implementation only checked org membership.
-- This adds back the has_permission('create_edit_checklists') guard
-- that the original RLS policy intended to enforce.
-- Calling has_permission() from inside a SECURITY DEFINER function
-- is reliable; it was only unreliable when invoked from RLS policies.
-- ================================================================

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

  IF NOT public.has_permission('create_edit_checklists') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete checklists';
  END IF;

  DELETE FROM public.checklists
  WHERE id = p_id
    AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist not found or does not belong to your organization';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_checklist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_checklist(uuid) TO authenticated;
