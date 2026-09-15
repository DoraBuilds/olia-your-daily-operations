-- ================================================================
-- Introduce team_members.is_owner as the authoritative "is this the
-- account owner" flag, decoupled from the `role` text column.
--
-- Why: #748/#747 turns `role` into a free-text job title (e.g. "Head
-- Chef") instead of the Owner/Manager tier selector. But `role =
-- 'Owner'` is load-bearing security logic in ~10 places — PIN
-- validation (admin/kiosk/library), owner-only write protection,
-- duplicate-owner-email prevention, InfoHub content permissions,
-- notification-rule access. Rather than touch all of that in the
-- same change that reshapes `role`, this migration adds `is_owner`
-- as an independent flag FIRST, backfills it from the current
-- `role = 'Owner'` rows, and rewires every one of those consumers to
-- read `is_owner` instead. `role` itself is untouched here — still
-- 'Owner'/'Manager' as before — so this migration is a no-op from
-- the app's point of view; it only changes which column the security
-- checks read from.
--
-- Every function below is redefined at its CURRENT (latest
-- CREATE OR REPLACE) version — earlier superseded versions in older
-- migration files are left alone, since Postgres only keeps the most
-- recent definition anyway.
-- ================================================================

-- ── 1. is_owner column ──────────────────────────────────────────
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

UPDATE public.team_members SET is_owner = true WHERE lower(role) = 'owner' AND NOT is_owner;

-- ── 1b. Keep is_owner in lockstep with role='Owner' until the client
--       is cut over to setting is_owner directly (the later "role
--       becomes free-text job title" phase of #747). The client's
--       TeamMemberModal still writes role='Owner'/'Manager' today —
--       without this, editing an existing member's role to "Owner"
--       through that modal would leave is_owner stuck at false, a
--       silent mismatch between the displayed role and actual access.
--
--       IMPORTANT: this trigger must be DROPPED in the migration that
--       turns `role` into a free-text job title, or every role edit
--       ("Head Chef" etc.) would incorrectly reset is_owner to false.
--
--       Fires on UPDATE OF role OR is_owner (not just role): an Owner
--       caller passes the escalation check below regardless of which
--       of the two columns they touch, so without covering is_owner
--       here too, an Owner setting is_owner directly (without also
--       touching role in the same statement) could desync the two —
--       e.g. role='Owner' but is_owner=false. Covering both columns
--       means any write to either always re-derives is_owner from the
--       current role, so they can never drift apart.
CREATE OR REPLACE FUNCTION public.sync_team_member_is_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_owner := (lower(NEW.role) = 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_sync_is_owner ON team_members;

CREATE TRIGGER team_members_sync_is_owner
  BEFORE INSERT OR UPDATE OF role, is_owner ON team_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_is_owner();

-- ── 2. Close a privilege-escalation gap: is_owner must be as
--    protected as role/permissions/location_ids/organization_id.
--    Without this, the "update my own row" RLS branch (team_members_update)
--    would let a non-owner flip their own is_owner to true directly,
--    even though role/permissions stayed locked down.
--
--    The trigger itself already exists and is attached from
--    20260821000001 (team_members_prevent_escalation, BEFORE UPDATE,
--    unconditional — fires on every update, not just role/is_owner) —
--    CREATE OR REPLACE FUNCTION below updates its body in place without
--    needing to touch the trigger, since Postgres triggers reference
--    functions by name and pick up a replaced body automatically.
--    Re-declaring the trigger here too anyway, so this migration is
--    self-contained and correct even if read or replayed in isolation.
CREATE OR REPLACE FUNCTION public.prevent_team_member_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner() THEN
    IF NEW.role            IS DISTINCT FROM OLD.role
       OR NEW.is_owner        IS DISTINCT FROM OLD.is_owner
       OR NEW.permissions     IS DISTINCT FROM OLD.permissions
       OR NEW.location_ids    IS DISTINCT FROM OLD.location_ids
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id AND OLD.auth_user_id IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Only an Owner can change role, ownership, permissions, location assignments, organization, or account linkage';
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

-- ── 3. is_owner() — central helper (20260821000001) ──────────────
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT team_members.is_owner
  FROM team_members
  WHERE id = auth.uid() OR auth_user_id = auth.uid()
  LIMIT 1
$$;

-- ── 4. validate_admin_pin (latest: 20260708000003) ───────────────
-- Admin-panel PIN entry from the kiosk — Owner only.
CREATE OR REPLACE FUNCTION public.validate_admin_pin(p_pin text, p_location_id uuid)
RETURNS TABLE (
  id              uuid,
  organization_id uuid,
  name            text,
  email           text,
  role            text,
  location_ids    uuid[],
  permissions     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recent_failures INT;
  v_matched         BOOLEAN := false;
  v_row             RECORD;
BEGIN
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id = p_location_id
    AND pin_type    = 'admin'
    AND succeeded   = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF auth.role() = 'authenticated' THEN
    SELECT
      tm.id, tm.organization_id, tm.name, tm.email,
      tm.role, tm.location_ids, tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND target.organization_id = public.current_org_id()
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND tm.is_owner
   LIMIT 1;
  ELSE
    SELECT
      tm.id, tm.organization_id, tm.name, tm.email,
      tm.role, tm.location_ids, tm.permissions
    INTO v_row
    FROM public.locations target
    JOIN public.team_members tm
      ON tm.organization_id = target.organization_id
   WHERE target.id = p_location_id
     AND tm.pin IS NOT NULL
     AND crypt(p_pin, tm.pin) = tm.pin
     AND tm.is_owner
   LIMIT 1;
  END IF;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'admin', v_matched);

  IF v_matched THEN
    RETURN QUERY SELECT
      v_row.id, v_row.organization_id, v_row.name, v_row.email,
      v_row.role, v_row.location_ids, v_row.permissions;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;

-- ── 5. validate_kiosk_member_pin (latest: 20260724000003) ────────
CREATE OR REPLACE FUNCTION public.validate_kiosk_member_pin(
  p_pin         text,
  p_location_id uuid
)
RETURNS TABLE (
  id              uuid,
  name            text,
  organization_id uuid,
  role            text,
  location_ids    uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recent_failures INT;
  v_matched         BOOLEAN := false;
  v_row             RECORD;
BEGIN
  DELETE FROM pin_attempts
  WHERE location_id = p_location_id
    AND attempted_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_recent_failures
  FROM pin_attempts
  WHERE location_id  = p_location_id
    AND pin_type     = 'member'
    AND succeeded    = false
    AND attempted_at > now() - INTERVAL '5 minutes';

  IF v_recent_failures >= 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait before trying again.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    tm.id,
    tm.name,
    tm.organization_id,
    tm.role,
    coalesce(tm.location_ids, '{}') AS location_ids
  INTO v_row
  FROM public.locations loc
  JOIN public.team_members tm
    ON tm.organization_id = loc.organization_id
  WHERE loc.id = p_location_id
    AND tm.pin IS NOT NULL
    AND crypt(p_pin, tm.pin) = tm.pin
  ORDER BY tm.is_owner DESC, tm.created_at ASC
  LIMIT 1;

  v_matched := (v_row IS NOT NULL AND v_row.id IS NOT NULL);

  INSERT INTO pin_attempts (location_id, pin_type, succeeded)
  VALUES (p_location_id, 'member', v_matched);

  IF v_matched THEN
    RETURN QUERY SELECT v_row.id, v_row.name, v_row.organization_id, v_row.role, v_row.location_ids;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_kiosk_member_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_kiosk_member_pin(text, uuid) TO anon, authenticated;

-- ── 6. get_kiosk_library (latest: 20260724000004) ────────────────
CREATE OR REPLACE FUNCTION public.get_kiosk_library(
  p_location_id    uuid,
  p_team_member_id uuid,
  p_kiosk_token    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_role        text;
  v_member_lids uuid[];
  v_is_owner    boolean := false;
BEGIN
  IF p_kiosk_token IS NULL THEN
    RETURN '{"folders":[],"documents":[]}'::jsonb;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM locations
  WHERE id = p_location_id
    AND kiosk_token = p_kiosk_token;

  IF v_org_id IS NULL THEN
    RETURN '{"folders":[],"documents":[]}'::jsonb;
  END IF;

  IF p_team_member_id IS NOT NULL THEN
    SELECT tm.role, tm.is_owner, coalesce(tm.location_ids, '{}')
    INTO v_role, v_is_owner, v_member_lids
    FROM team_members tm
    WHERE tm.id = p_team_member_id
      AND tm.organization_id = v_org_id;
  END IF;

  RETURN jsonb_build_object(
    'folders', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id)
          ORDER BY f.name
        ),
        '[]'::jsonb
      )
      FROM infohub_folders f
      WHERE f.organization_id = v_org_id
        AND f.section = 'library'
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && f.allowed_location_ids)
        )
    ),
    'documents', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'title', d.title,
            'summary', d.summary,
            'body', d.body,
            'folder_id', d.folder_id,
            'metadata', coalesce(d.metadata, '{}'::jsonb)
          ) ORDER BY d.title
        ),
        '[]'::jsonb
      )
      FROM infohub_documents d
      JOIN infohub_folders f ON f.id = d.folder_id
      WHERE d.organization_id = v_org_id
        AND d.section = 'library'
        AND d.archived_at IS NULL
        AND (
          v_is_owner
          OR d.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(d.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(d.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && d.allowed_location_ids)
        )
        AND (
          v_is_owner
          OR f.access_scope = 'org'
          OR (p_team_member_id IS NOT NULL AND p_team_member_id = ANY(f.allowed_team_member_ids))
          OR (v_role IS NOT NULL AND v_role = ANY(f.allowed_roles))
          OR (v_member_lids IS NOT NULL AND v_member_lids <> '{}' AND v_member_lids && f.allowed_location_ids)
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kiosk_library(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_library(uuid, uuid, uuid) TO anon, authenticated;

-- ── 7. InfoHub content permissions (20260327000007, still current) ─
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
    WHERE tm.id = auth.uid()
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
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        WHERE tm.id = auth.uid()
          AND tm.organization_id = p_org_id
          AND (
            tm.is_owner
            OR tm.id = ANY(COALESCE(p_allowed_team_member_ids, '{}'::uuid[]))
            OR tm.role = ANY(COALESCE(p_allowed_roles, '{}'::text[]))
            OR COALESCE(tm.location_ids && COALESCE(p_allowed_location_ids, '{}'::uuid[]), false)
          )
      )
    );
$$;

-- ── 8. checklist_notification_rules RLS (20260724000002) ─────────
DROP POLICY IF EXISTS "owners can manage notification rules" ON public.checklist_notification_rules;

CREATE POLICY "owners can manage notification rules"
  ON public.checklist_notification_rules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.team_members
       WHERE id = auth.uid() AND is_owner
    )
  );

-- ── 9. Duplicate-owner-email guard (20260408000004) ──────────────
CREATE OR REPLACE VIEW public.team_member_email_duplicates AS
SELECT
  lower(trim(email)) AS normalized_email,
  count(*) AS row_count,
  array_agg(id ORDER BY created_at ASC) AS team_member_ids,
  array_agg(organization_id ORDER BY created_at ASC) AS organization_ids
FROM public.team_members
WHERE archived_at IS NULL
  AND is_owner
GROUP BY lower(trim(email))
HAVING count(*) > 1;

DROP INDEX IF EXISTS public.team_members_active_owner_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_active_owner_email_unique
  ON public.team_members (lower(trim(email)))
  WHERE archived_at IS NULL
    AND is_owner;

-- ── 10. admin_reveal_pin (20260724000001, still current) ─────────
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
  v_vault_org       uuid;
  v_pin             text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id, is_owner
  INTO v_caller_org, v_caller_is_owner
  FROM public.team_members
  WHERE id = auth.uid();

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

  RETURN v_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reveal_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reveal_pin(text, uuid) TO authenticated;

-- ── 11. setup_new_organization (latest: 20260508000001) ──────────
-- New signups' first team_member row is the owner — stamp is_owner
-- directly instead of relying on role text.
CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_business_name TEXT,
  p_location_name TEXT DEFAULT NULL,
  p_owner_name    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id              uuid := auth.uid();
  v_user_email           text;
  v_owner_name           text;
  v_org_id               uuid;
  v_conflicting_owner_id uuid;
  v_tm                   jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(1, hashtext(v_user_id::text));

  IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id) THEN
    SELECT jsonb_build_object(
      'id',                  tm.id,
      'organization_id',     tm.organization_id,
      'name',                tm.name,
      'email',               tm.email,
      'role',                tm.role,
      'location_ids',        tm.location_ids,
      'permissions',         tm.permissions,
      'pin_reset_required',  tm.pin_reset_required
    )
    INTO v_tm
    FROM team_members tm
    WHERE tm.id = v_user_id;

    RETURN jsonb_build_object('team_member', v_tm, 'existed', true);
  END IF;

  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_user_email, v_owner_name
  FROM auth.users
  WHERE id = v_user_id;

  IF p_owner_name IS NOT NULL AND trim(p_owner_name) != '' THEN
    v_owner_name := trim(p_owner_name);
  END IF;

  SELECT tm.id
  INTO v_conflicting_owner_id
  FROM public.team_members tm
  WHERE lower(trim(tm.email)) = lower(trim(v_user_email))
    AND tm.is_owner
    AND tm.archived_at IS NULL
    AND tm.id <> v_user_id
  LIMIT 1;

  IF v_conflicting_owner_id IS NOT NULL THEN
    RAISE EXCEPTION
      'An owner account with email % already exists. Please contact support so we can safely verify your organization access.',
      v_user_email;
  END IF;

  INSERT INTO organizations (name, plan, plan_status)
  VALUES (trim(p_business_name), 'starter', 'active')
  RETURNING id INTO v_org_id;

  INSERT INTO team_members (
    id, organization_id, name, email, role, is_owner,
    location_ids, permissions, pin, pin_reset_required
  ) VALUES (
    v_user_id,
    v_org_id,
    v_owner_name,
    v_user_email,
    'Owner',
    true,
    ARRAY[]::uuid[],
    '{
      "create_edit_checklists": true,
      "assign_checklists": true,
      "manage_staff_profiles": true,
      "view_reporting": true,
      "edit_location_details": true,
      "manage_alerts": true,
      "export_data": true,
      "override_inactivity_threshold": true
    }'::jsonb,
    crypt('1234', gen_salt('bf', 12)),
    true
  );

  SELECT jsonb_build_object(
    'id',                  tm.id,
    'organization_id',     tm.organization_id,
    'name',                tm.name,
    'email',               tm.email,
    'role',                tm.role,
    'location_ids',        tm.location_ids,
    'permissions',         tm.permissions,
    'pin_reset_required',  tm.pin_reset_required
  )
  INTO v_tm
  FROM team_members tm
  WHERE tm.id = v_user_id;

  RETURN jsonb_build_object('team_member', v_tm, 'existed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) TO authenticated;
