-- ================================================================
-- Platform admin "support mode"
-- ================================================================
-- Lets Olia staff (platform admins) enter any customer organization
-- with full owner rights, for support and maintenance.
--
-- How it works: nearly every RLS policy and RPC resolves the caller's
-- org through current_org_id() and their rights through has_permission()
-- / is_owner(). A platform admin who has "entered" an org gets a row in
-- platform_admin_sessions; while that row exists those helpers return
-- the entered org and full owner rights instead of the admin's own.
--
--   platform_admins           — who is a platform admin (by confirmed
--                               login email). No API access at all;
--                               edit it from the SQL editor only.
--   platform_admin_sessions   — the org each admin is currently viewing.
--   platform_admin_audit_log  — every enter / exit / PIN reveal. Internal
--                               only: never visible to customers.
--
-- Deliberately NOT covered: edge functions (billing, delete-my-account,
-- invites) resolve the caller's own team_members row, so they keep
-- acting on the admin's own org. The client disables those actions in
-- support mode, and delete_my_account() refuses outright below.
-- ================================================================

-- ── 1. Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_admins (
  email      text        PRIMARY KEY CHECK (email = lower(trim(email))),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;

INSERT INTO public.platform_admins (email) VALUES
  ('dora.angelov@gmail.com'),
  ('dora@oliahq.com')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_admin_sessions (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_sessions FROM anon, authenticated;

-- No FKs: the log must outlive both the admin account and a purged org.
CREATE TABLE IF NOT EXISTS public.platform_admin_audit_log (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id     uuid        NOT NULL,
  admin_email       text        NOT NULL,
  organization_id   uuid,
  organization_name text,
  action            text        NOT NULL CHECK (action IN ('enter', 'exit', 'reveal_pin')),
  detail            jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admin_audit_log_created_at_idx
  ON public.platform_admin_audit_log (created_at DESC);

ALTER TABLE public.platform_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_audit_log FROM anon, authenticated;

-- ── 2. Helpers ──────────────────────────────────────────────────

-- True when the caller's confirmed login email is on platform_admins.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.platform_admins pa ON pa.email = lower(trim(u.email))
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

-- The org a platform admin is currently viewing, or NULL. Checks the
-- (almost always empty) sessions table first so the admin lookup only
-- runs for callers who actually have a session — this sits inside
-- current_org_id(), which runs on every RLS check.
CREATE OR REPLACE FUNCTION public.platform_admin_viewing_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.organization_id
  FROM public.platform_admin_sessions s
  WHERE s.user_id = auth.uid()
    AND public.is_platform_admin()
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_log(
  p_org_id uuid,
  p_action text,
  p_detail jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.platform_admin_audit_log
    (admin_user_id, admin_email, organization_id, organization_name, action, detail)
  SELECT auth.uid(),
         (SELECT lower(email) FROM auth.users WHERE id = auth.uid()),
         p_org_id,
         (SELECT name FROM public.organizations WHERE id = p_org_id),
         p_action,
         p_detail;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_log(uuid, text, jsonb) FROM PUBLIC;

-- ── 3. Org / permission helpers honour support mode ─────────────

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.platform_admin_viewing_org(),
    (SELECT organization_id
     FROM team_members
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
     LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.platform_admin_viewing_org() IS NOT NULL THEN true
    ELSE (
      SELECT COALESCE((permissions->>perm)::boolean, false)
      FROM team_members
      WHERE id = auth.uid() OR auth_user_id = auth.uid()
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.platform_admin_viewing_org() IS NOT NULL THEN true
    ELSE (
      SELECT team_members.is_owner
      FROM team_members
      WHERE id = auth.uid() OR auth_user_id = auth.uid()
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.can_view_org_reporting(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.platform_admin_viewing_org() = p_org_id, false)
  OR EXISTS (
    SELECT 1
    FROM team_members tm
    WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
      AND tm.organization_id = p_org_id
      AND (
        tm.is_owner
        OR (tm.is_manager AND COALESCE((tm.permissions->>'view_reporting')::boolean, false))
      )
  );
$$;

CREATE OR REPLACE FUNCTION infohub_can_manage_content(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.platform_admin_viewing_org() = p_org_id, false)
  OR EXISTS (
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

CREATE OR REPLACE FUNCTION infohub_scope_allows(
  p_org_id uuid,
  p_access_scope infohub_access_scope,
  p_allowed_team_member_ids uuid[],
  p_allowed_roles text[],
  p_allowed_location_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_org_id = current_org_id()
    AND (
      p_access_scope = 'org'
      OR public.platform_admin_viewing_org() IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE (tm.id = auth.uid() OR tm.auth_user_id = auth.uid())
          AND tm.organization_id = p_org_id
          AND (
            tm.is_owner
            OR tm.id = ANY(COALESCE(p_allowed_team_member_ids, '{}'::uuid[]))
            OR tm.role = ANY(COALESCE(p_allowed_roles, '{}'::text[]))
            OR CASE WHEN COALESCE(tm.location_ids, '{}') = '{}'
              THEN COALESCE(array_length(p_allowed_location_ids, 1), 0) > 0
              ELSE COALESCE(tm.location_ids && COALESCE(p_allowed_location_ids, '{}'::uuid[]), false) END
          )
      )
    );
$$;

-- ── 4. Policies that bypassed current_org_id() ──────────────────

DROP POLICY IF EXISTS "owners can manage notification rules" ON public.checklist_notification_rules;
CREATE POLICY "owners can manage notification rules"
  ON public.checklist_notification_rules
  FOR ALL
  USING (organization_id = public.current_org_id() AND public.is_owner());

DROP POLICY IF EXISTS "infohub_file_upload_own_org" ON storage.objects;
CREATE POLICY "infohub_file_upload_own_org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "infohub_file_read_own_org" ON storage.objects;
CREATE POLICY "infohub_file_read_own_org"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "infohub_file_delete_own_org" ON storage.objects;
CREATE POLICY "infohub_file_delete_own_org"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'infohub-files'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- ── 5. PIN RPCs: work (and are logged) in support mode ──────────

CREATE OR REPLACE FUNCTION public.vault_staff_pin(
  p_profile_id uuid,
  p_pin        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_caller_org  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.staff_profiles
  WHERE id = p_profile_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  v_caller_org := public.platform_admin_viewing_org();
  IF v_caller_org IS NULL THEN
    SELECT organization_id INTO v_caller_org
    FROM public.team_members
    WHERE id = auth.uid();
  END IF;

  IF v_org_id <> v_caller_org THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.pin_vault (member_type, member_id, org_id, pin, updated_at)
  VALUES ('staff_profile', p_profile_id, v_org_id, p_pin, now())
  ON CONFLICT (member_type, member_id)
  DO UPDATE SET pin = EXCLUDED.pin, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reveal_pin(
  p_member_type text,
  p_member_id   uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org      uuid;
  v_caller_is_owner boolean;
  v_support_org     uuid;
  v_vault_org       uuid;
  v_pin             text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_support_org := public.platform_admin_viewing_org();
  IF v_support_org IS NOT NULL THEN
    v_caller_org := v_support_org;
    v_caller_is_owner := true;
  ELSE
    SELECT organization_id, is_owner
    INTO v_caller_org, v_caller_is_owner
    FROM public.team_members
    WHERE id = auth.uid();
  END IF;

  IF NOT COALESCE(v_caller_is_owner, false) THEN
    RAISE EXCEPTION 'Only Owners can reveal PINs';
  END IF;

  SELECT org_id, pin
  INTO v_vault_org, v_pin
  FROM public.pin_vault
  WHERE member_type = p_member_type AND member_id = p_member_id;

  IF v_vault_org IS NULL THEN
    RAISE EXCEPTION 'PIN not found — it may have been set before this feature was enabled';
  END IF;

  IF v_vault_org <> v_caller_org THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_support_org IS NOT NULL THEN
    PERFORM public.platform_admin_log(
      v_support_org, 'reveal_pin',
      jsonb_build_object('member_type', p_member_type, 'member_id', p_member_id)
    );
  END IF;

  RETURN v_pin;
END;
$$;

-- ── 6. delete_my_account() must never run in support mode ──────
-- It resolves the org via current_org_id(), so in support mode it
-- would schedule the *customer's* org for purge and delete the
-- admin's own login.

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

  IF EXISTS (SELECT 1 FROM public.platform_admin_sessions WHERE user_id = v_caller_id) THEN
    RETURN json_build_object('success', false, 'reason', 'Exit support mode before deleting an account');
  END IF;

  -- Resolve org — uses the same helper all RLS policies rely on
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'No organisation found');
  END IF;

  -- Soft delete: mark for purge in 30 days. Every org-scoped row (locations,
  -- team_members, staff_profiles, folders, checklists, checklist_logs,
  -- team_member_invites, etc.) stays in place until the purge sweep below.
  UPDATE public.organizations
  SET deletion_requested_at = now()
  WHERE id = v_org_id;

  -- Remove the auth account now — this is what actually signs the owner out
  -- and blocks them from logging back in. Since current_org_id() resolves
  -- via `team_members WHERE id = auth.uid()`, deleting this row also makes
  -- the (still-present) org data unreachable through the API immediately,
  -- with no separate RLS change needed.
  DELETE FROM auth.users WHERE id = v_caller_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ── 7. Support-mode RPCs ────────────────────────────────────────

-- Safe for every signed-in user: non-admins just get is_admin = false.
CREATE OR REPLACE FUNCTION public.platform_admin_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN jsonb_build_object('is_admin', false, 'viewing', NULL);
  END IF;

  SELECT o.* INTO v_org
  FROM public.platform_admin_sessions s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.user_id = auth.uid();

  RETURN jsonb_build_object(
    'is_admin', true,
    'viewing', CASE WHEN v_org.id IS NULL THEN NULL
                    ELSE jsonb_build_object('id', v_org.id, 'name', v_org.name) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_list_orgs()
RETURNS TABLE (
  id                    uuid,
  name                  text,
  plan                  text,
  plan_status           text,
  created_at            timestamptz,
  deletion_requested_at timestamptz,
  owner_name            text,
  owner_email           text,
  member_count          bigint,
  location_count        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.name, o.plan, o.plan_status, o.created_at, o.deletion_requested_at,
    owner.name, owner.email,
    (SELECT count(*) FROM public.team_members tm WHERE tm.organization_id = o.id),
    (SELECT count(*) FROM public.locations l WHERE l.organization_id = o.id)
  FROM public.organizations o
  LEFT JOIN LATERAL (
    SELECT tm.name, tm.email
    FROM public.team_members tm
    WHERE tm.organization_id = o.id AND tm.is_owner
    ORDER BY tm.created_at
    LIMIT 1
  ) owner ON true
  ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_enter_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous uuid;
  v_name     text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;

  SELECT name INTO v_name FROM public.organizations WHERE id = p_org_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  SELECT organization_id INTO v_previous
  FROM public.platform_admin_sessions
  WHERE user_id = auth.uid();

  IF v_previous IS NOT NULL AND v_previous <> p_org_id THEN
    PERFORM public.platform_admin_log(v_previous, 'exit');
  END IF;

  INSERT INTO public.platform_admin_sessions (user_id, organization_id, started_at)
  VALUES (auth.uid(), p_org_id, now())
  ON CONFLICT (user_id)
  DO UPDATE SET organization_id = EXCLUDED.organization_id, started_at = now();

  IF v_previous IS DISTINCT FROM p_org_id THEN
    PERFORM public.platform_admin_log(p_org_id, 'enter');
  END IF;

  RETURN jsonb_build_object('id', p_org_id, 'name', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_exit_org()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- No admin check: anyone may clear their own session (e.g. an admin
  -- who was since removed from platform_admins).
  DELETE FROM public.platform_admin_sessions
  WHERE user_id = auth.uid()
  RETURNING organization_id INTO v_org;

  IF v_org IS NOT NULL THEN
    PERFORM public.platform_admin_log(v_org, 'exit');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_recent_access(p_limit int DEFAULT 50)
RETURNS TABLE (
  id                bigint,
  admin_email       text,
  organization_id   uuid,
  organization_name text,
  action            text,
  created_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;

  RETURN QUERY
  SELECT l.id, l.admin_email, l.organization_id, l.organization_name, l.action, l.created_at
  FROM public.platform_admin_audit_log l
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_status()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_admin_list_orgs()            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_admin_enter_org(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_admin_exit_org()             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_admin_recent_access(int)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_status()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_orgs()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_enter_org(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_exit_org()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_recent_access(int)  TO authenticated;
