-- ================================================================
-- Team member invitations
--
-- Enables admins to invite team members by email. When an invitation
-- is accepted, the invited user's auth.uid() is linked to their
-- pre-created team_members row via auth_user_id.
--
-- Changes:
--   1. team_members.auth_user_id — links an accepted invite to auth.users
--   2. current_org_id() — updated to recognise auth_user_id lookup
--   3. has_permission()  — updated to recognise auth_user_id lookup
--   4. team_member_invites — tracks pending/accepted invite tokens
--   5. validate_invite_token() — public RPC for the accept-invite page
--   6. accept_invite() — authenticated RPC that links auth.uid()
-- ================================================================

-- ── 1. auth_user_id column ───────────────────────────────────────
-- Nullable UUID that gets stamped when an invited user first logs in.
-- Unique: one auth account can only be linked to one team_member row.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- ── 2. current_org_id() ─────────────────────────────────────────
-- Previously only checked id = auth.uid() (owners created via
-- setup_new_organization). Now also checks auth_user_id so invited
-- managers pass all org-scoped RLS policies after accepting their invite.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM team_members
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1
$$;

-- ── 3. has_permission() ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((permissions->>perm)::boolean, false)
  FROM team_members
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1
$$;

-- ── 4. team_member_invites ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_member_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id)   ON DELETE CASCADE,
  team_member_id  UUID        NOT NULL REFERENCES team_members(id)    ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  token           UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_member_invites ENABLE ROW LEVEL SECURITY;

-- Org members can read/manage invites for their own org
CREATE POLICY "invites_org_access" ON team_member_invites FOR ALL
  USING  (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- ── 5. validate_invite_token() ──────────────────────────────────
-- Public (no auth required). Returns org name + email for a valid,
-- un-accepted, non-expired token so the accept-invite page can
-- show a welcome message before the user signs in.
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT i.email, o.name AS org_name
  INTO   v_rec
  FROM   team_member_invites i
  JOIN   organizations        o ON o.id = i.organization_id
  WHERE  i.token       = p_token
    AND  i.accepted_at IS NULL
    AND  i.expires_at  > now();

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false);
  END IF;

  RETURN json_build_object(
    'valid',             true,
    'email',             v_rec.email,
    'organization_name', v_rec.org_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite_token(UUID) TO anon, authenticated;

-- ── 6. accept_invite() ──────────────────────────────────────────
-- Requires an authenticated caller (auth.uid() is set).
-- Links the caller's auth account to their pre-created team_members
-- row, marks the invite as accepted, so subsequent logins resolve
-- via current_org_id() using auth_user_id = auth.uid().
CREATE OR REPLACE FUNCTION public.accept_invite(p_token UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_caller_email TEXT;
  v_invite       RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Not authenticated');
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  SELECT i.id, i.team_member_id, tm.email AS tm_email
  INTO   v_invite
  FROM   team_member_invites i
  JOIN   team_members         tm ON tm.id = i.team_member_id
  WHERE  i.token       = p_token
    AND  i.accepted_at IS NULL
    AND  i.expires_at  > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'Invalid or expired invite token');
  END IF;

  -- Prevent one user from accepting another user's invite
  IF lower(v_caller_email) != lower(v_invite.tm_email) THEN
    RETURN json_build_object('success', false, 'reason', 'Email mismatch');
  END IF;

  UPDATE team_members       SET auth_user_id = v_caller_id WHERE id     = v_invite.team_member_id;
  UPDATE team_member_invites SET accepted_at  = now()       WHERE id     = v_invite.id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;
