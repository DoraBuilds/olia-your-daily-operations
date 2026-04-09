-- Remove the orphaned test organization left behind by the archived
-- duplicate owner context cleanup.
--
-- Safety guard: only delete this specific organization if it still has
-- no active auth-backed owner row.

DO $$
DECLARE
  v_orphan_org_id constant uuid := '0a91073c-941d-4d7f-9627-93b3b59a1fa2'::uuid;
  v_has_auth_backed_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN auth.users au
      ON au.id = tm.id
    WHERE tm.organization_id = v_orphan_org_id
      AND lower(tm.role) = 'owner'
      AND tm.archived_at IS NULL
  )
  INTO v_has_auth_backed_owner;

  IF v_has_auth_backed_owner THEN
    RAISE NOTICE 'Skipping orphan org cleanup for %, because an auth-backed owner still exists.', v_orphan_org_id;
    RETURN;
  END IF;

  DELETE FROM public.organizations
  WHERE id = v_orphan_org_id;
END;
$$;
