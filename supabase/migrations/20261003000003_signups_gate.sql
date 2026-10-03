-- ================================================================
-- Server-side signup gate.
--
-- While the waitlist is on, nobody may create a new company, even by calling
-- the public RPC directly with their own session. setup_new_organization is the
-- only way an organization is created (organizations has no INSERT policy), so
-- gating it here closes the back door that the front-end redirect can't.
--
-- The switch is public.app_config key 'signups_enabled' (default 'false').
-- app_config is not readable or writable by API roles, so only the SQL editor
-- or a migration can change it:
--
--   UPDATE public.app_config SET value = 'true' WHERE key = 'signups_enabled';
--
-- NOT affected (they never reach the gated branch):
--   * existing owners / members: the idempotency branch returns first
--   * invited members: accept_invite() creates their team_members row
--   * kiosk pairing, kiosk admin login, super-admin support mode
-- ================================================================

INSERT INTO public.app_config (key, value) VALUES ('signups_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

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

  -- Everything below creates a brand-new organization. Closed until
  -- app_config.signups_enabled is set to 'true'.
  IF COALESCE((SELECT value FROM public.app_config WHERE key = 'signups_enabled'), 'false') <> 'true' THEN
    RAISE EXCEPTION 'Signups are not open yet';
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
    id, organization_id, name, email, role, is_owner, is_manager,
    location_ids, permissions, pin, pin_reset_required
  ) VALUES (
    v_user_id,
    v_org_id,
    v_owner_name,
    v_user_email,
    'Owner',
    true,
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
