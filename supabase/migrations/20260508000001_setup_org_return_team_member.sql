-- ================================================================
-- Return the full team_member row from setup_new_organization so the
-- client never needs a second SELECT after setup. This eliminates the
-- RLS re-fetch failure that caused setupError on new signups:
--
--   setup_new_organization runs as SECURITY DEFINER → can read/write
--   team_members without RLS.  The subsequent re-fetch in AuthContext
--   went through RLS which calls current_org_id() → requires a stable
--   search_path.  When that path was wrong the re-fetch returned NULL
--   and the user was bounced back to the signup page even though their
--   org had been created successfully.
--
-- New return shape (both branches):
--   { team_member: { id, organization_id, name, email, role,
--                    location_ids, permissions, pin_reset_required },
--     existed: true|false }
-- ================================================================

CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_business_name TEXT,
  p_location_name TEXT DEFAULT NULL,
  p_owner_name    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Returning user: row already exists — return it directly (SECURITY DEFINER
  -- bypasses RLS so this always works regardless of search_path state).
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

  -- New user: resolve name + email from auth.users
  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  INTO v_user_email, v_owner_name
  FROM auth.users
  WHERE id = v_user_id;

  IF p_owner_name IS NOT NULL AND trim(p_owner_name) != '' THEN
    v_owner_name := trim(p_owner_name);
  END IF;

  -- Guard: another Owner row already exists with this email
  SELECT tm.id
  INTO v_conflicting_owner_id
  FROM public.team_members tm
  WHERE lower(trim(tm.email)) = lower(trim(v_user_email))
    AND lower(tm.role) = 'owner'
    AND tm.archived_at IS NULL
    AND tm.id <> v_user_id
  LIMIT 1;

  IF v_conflicting_owner_id IS NOT NULL THEN
    RAISE EXCEPTION
      'An owner account with email % already exists. Please contact support so we can safely verify your organization access.',
      v_user_email;
  END IF;

  -- Create org
  INSERT INTO organizations (name, plan, plan_status)
  VALUES (trim(p_business_name), 'starter', 'active')
  RETURNING id INTO v_org_id;

  -- Create team_member and capture its data in one step
  INSERT INTO team_members (
    id, organization_id, name, email, role,
    location_ids, permissions, pin, pin_reset_required
  ) VALUES (
    v_user_id,
    v_org_id,
    v_owner_name,
    v_user_email,
    'Owner',
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

  -- Re-read the just-inserted row (SECURITY DEFINER — no RLS involved)
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
