-- ================================================================
-- delete_checklist RPC
--
-- SECURITY DEFINER function that deletes a checklist, bypassing
-- table RLS entirely.
--
-- Motivation: the checklists DELETE RLS policy requires
-- has_permission('create_edit_checklists'), which proved unreliable
-- under the authenticated role (same root cause as save_checklist).
-- Running as SECURITY DEFINER lets this function do its own explicit
-- org-membership check and then delete directly.
--
-- Authorization model:
--   - The caller must belong to an organization (current_org_id() IS NOT NULL)
--   - The target checklist must belong to the caller's org
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
