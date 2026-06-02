-- When the last team_member of an org is deleted (e.g. because the auth user
-- was removed via the Supabase dashboard), automatically delete the organisation
-- too. This cascades to locations, checklists, staff_profiles, and all other
-- org-scoped tables via their existing ON DELETE CASCADE foreign keys.
--
-- Without this trigger, deleting an auth user only cascade-deletes the
-- team_members row; the organisations row and all its data become orphaned
-- and will reappear for anyone who re-registers with the same email.

CREATE OR REPLACE FUNCTION public.cleanup_org_when_last_member_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE organization_id = OLD.organization_id
  ) THEN
    DELETE FROM public.organizations WHERE id = OLD.organization_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_org_after_member_removed ON public.team_members;

CREATE TRIGGER trg_cleanup_org_after_member_removed
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_org_when_last_member_removed();
