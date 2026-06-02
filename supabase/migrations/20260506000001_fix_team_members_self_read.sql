-- ================================================================
-- Allow a user to always read their own team_members row directly,
-- independent of current_org_id().
--
-- The old policy: USING (organization_id = current_org_id())
-- requires current_org_id() to resolve correctly before the row is
-- visible. If current_org_id() returns NULL for any reason (e.g. a
-- brief window during auth, connection pool timing), the user cannot
-- read their own row and fetchTeamMember falls through to the new-
-- org setup path, which fails as a duplicate and surfaces as a
-- setup error screen.
--
-- The fix splits the single FOR ALL policy into per-operation
-- policies so that:
--   SELECT/UPDATE — id = auth.uid() acts as a fallback when
--     current_org_id() is NULL, preserving the auth-window fix.
--   INSERT        — always requires a valid org context.
--   DELETE        — always requires a valid org context; no self-
--     delete bypass. Without this restriction a user could delete
--     their own row while current_org_id() is NULL, triggering the
--     cleanup_org_when_last_member_removed trigger and cascade-
--     deleting the entire organisation.
-- ================================================================

DROP POLICY IF EXISTS "team_members_all" ON team_members;

-- SELECT: own row is always visible; org rows visible when org resolves.
CREATE POLICY "team_members_select" ON team_members FOR SELECT
  USING (id = auth.uid() OR organization_id = current_org_id());

-- INSERT: org context must resolve — no inserting into a null org.
CREATE POLICY "team_members_insert" ON team_members FOR INSERT
  WITH CHECK (organization_id = current_org_id());

-- UPDATE: can target own row or any org row; new value must stay in org.
CREATE POLICY "team_members_update" ON team_members FOR UPDATE
  USING (id = auth.uid() OR organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- DELETE: org context required — prevents accidental org cascade-delete
-- when current_org_id() is NULL during an edge-case session.
CREATE POLICY "team_members_delete" ON team_members FOR DELETE
  USING (organization_id = current_org_id());
