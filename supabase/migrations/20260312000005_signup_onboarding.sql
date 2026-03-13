-- ============================================================
-- SIGNUP ONBOARDING: setup_new_organization
-- Called from AuthContext after a new user's first sign-in.
-- Atomically creates the org, first location, and Owner team_member.
-- SECURITY DEFINER runs as the function owner so it can INSERT into
-- organizations and locations without needing explicit public policies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_business_name TEXT,
  p_location_name TEXT,
  p_owner_name    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_user_email  text;
  v_owner_name  text;
  v_org_id      uuid;
  v_location_id uuid;
BEGIN
  -- Require authentication
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency guard: if this user is already set up, return their existing IDs
  IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id) THEN
    SELECT tm.organization_id, l.id
    INTO v_org_id, v_location_id
    FROM team_members tm
    LEFT JOIN locations l ON l.organization_id = tm.organization_id
    WHERE tm.id = v_user_id
    ORDER BY l.created_at
    LIMIT 1;
    RETURN jsonb_build_object(
      'organization_id', v_org_id,
      'location_id',     v_location_id,
      'existed',         true
    );
  END IF;

  -- Fetch auth user details
  SELECT
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      split_part(email, '@', 1)
    )
  INTO v_user_email, v_owner_name
  FROM auth.users
  WHERE id = v_user_id;

  -- Allow caller to override the display name
  IF p_owner_name IS NOT NULL AND trim(p_owner_name) != '' THEN
    v_owner_name := trim(p_owner_name);
  END IF;

  -- Create organization (starter plan, active)
  INSERT INTO organizations (name, plan, plan_status)
  VALUES (trim(p_business_name), 'starter', 'active')
  RETURNING id INTO v_org_id;

  -- Create first location
  INSERT INTO locations (organization_id, name, inactivity_threshold)
  VALUES (v_org_id, trim(p_location_name), 80)
  RETURNING id INTO v_location_id;

  -- Create Owner team_member with full permissions
  INSERT INTO team_members (
    id, organization_id, name, email, role, location_ids, permissions
  ) VALUES (
    v_user_id,
    v_org_id,
    v_owner_name,
    v_user_email,
    'Owner',
    ARRAY[v_location_id],
    '{
      "create_edit_checklists": true,
      "assign_checklists": true,
      "manage_staff_profiles": true,
      "view_reporting": true,
      "edit_location_details": true,
      "manage_alerts": true,
      "export_data": true,
      "override_inactivity_threshold": true
    }'::jsonb
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'location_id',     v_location_id,
    'existed',         false
  );
END;
$$;

-- Grant: only authenticated users can invoke this
REVOKE ALL ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) TO authenticated;
