-- ================================================================
-- Close a privilege-escalation gap in team_members RLS.
--
-- Before this migration, "team_members_update" (from
-- 20260506000001_fix_team_members_self_read.sql) allowed:
--   USING (id = auth.uid() OR organization_id = current_org_id())
-- i.e. ANY authenticated team member in an org — Manager or Owner —
-- could UPDATE ANY OTHER team member's row in that org, including
-- their role/permissions/location assignments. A Manager could also
-- update their OWN row to set role = 'Owner' or flip any permission
-- flag to true, since nothing compared OLD vs NEW values.
--
-- The app's own UI already treats team management as Owner-only
-- (the "Users" tab in Admin.tsx only renders `isOwner && ...`), so
-- this migration makes the database agree:
--   1. Only an Owner may UPDATE a team_members row that isn't their
--      own (self-updates, e.g. last_seen_at, still work for anyone).
--   2. NOBODY may change role / permissions / location_ids /
--      organization_id on ANY row — including their own — unless
--      they are already an Owner. This blocks self-promotion even
--      through the "update my own row" path.
--   3. auth_user_id is exempt from that rule ONLY while it is still
--      NULL, because accept_invite() (20260519000001) legitimately
--      sets it once for a brand-new user who isn't an Owner (or any
--      team member) yet — that flow already has its own token +
--      email-match checks. Once auth_user_id is set, changing it
--      again is treated as a hijack attempt and still requires Owner.
-- ================================================================

-- Mirrors the id-OR-auth_user_id lookup used by current_org_id() /
-- has_permission() (20260519000001) — an invited team member's real
-- auth.uid() lives in auth_user_id, not id, so checking id alone
-- would make every invited Owner look like a non-Owner here.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role = 'Owner'
  FROM team_members
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1
$$;

DROP POLICY IF EXISTS "team_members_update" ON team_members;

-- "own row" also needs the auth_user_id branch for the same reason —
-- otherwise an invited (non-Owner) member loses the ability to update
-- their own row at all (PIN self-service, last_seen_at heartbeat),
-- since the org-wide branch now requires is_owner().
CREATE POLICY "team_members_update" ON team_members FOR UPDATE
  USING (
    id = auth.uid() OR auth_user_id = auth.uid()
    OR (organization_id = current_org_id() AND is_owner())
  )
  WITH CHECK (
    organization_id = current_org_id()
  );

CREATE OR REPLACE FUNCTION public.prevent_team_member_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner() THEN
    IF NEW.role            IS DISTINCT FROM OLD.role
       OR NEW.permissions     IS DISTINCT FROM OLD.permissions
       OR NEW.location_ids    IS DISTINCT FROM OLD.location_ids
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id AND OLD.auth_user_id IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Only an Owner can change role, permissions, location assignments, organization, or account linkage';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_prevent_escalation ON team_members;

CREATE TRIGGER team_members_prevent_escalation
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_team_member_self_escalation();
