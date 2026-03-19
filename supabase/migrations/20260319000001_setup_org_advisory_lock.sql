-- ============================================================
-- MIGRATION: Make setup_new_organization concurrent-safe.
--
-- Problem: AuthContext previously called fetchTeamMember from both
-- getSession() and onAuthStateChange simultaneously. For a brand-new
-- user, both calls raced past the IF EXISTS idempotency guard before
-- either had inserted into team_members, and both called
-- setup_new_organization concurrently. PostgreSQL's PK constraint
-- rolled back the second transaction, but:
--   1. The second JS call's catch block fired setSetupError → first-login
--      error screen appeared for new users.
--   2. In edge cases (very fast concurrent clients or retries) an orphan
--      organizations row could remain if the transaction partially wrote.
--
-- Fix: pg_advisory_xact_lock serialises concurrent executions for the
-- same user. The first call acquires the lock and proceeds. Any subsequent
-- concurrent call blocks at the lock line until the first transaction
-- commits, then re-checks the idempotency guard and finds the row →
-- returns 'existed: true' without creating a second org.
-- ============================================================

CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_business_name TEXT,
  p_location_name TEXT DEFAULT NULL,   -- kept for backward compat, ignored when NULL/empty
  p_owner_name    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_user_email text;
  v_owner_name text;
  v_org_id     uuid;
BEGIN
  -- Require authentication
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialise concurrent setup calls for the same user.
  -- pg_advisory_xact_lock blocks until it can acquire an exclusive
  -- transaction-level lock keyed to this user's UUID. The lock is
  -- released automatically when the transaction ends (commit or rollback).
  -- The two-argument form accepts int4 + int4; we use a fixed namespace
  -- key (1) and hashtext of the user id so different users don't block
  -- each other.
  PERFORM pg_advisory_xact_lock(1, hashtext(v_user_id::text));

  -- Idempotency guard (re-evaluated inside the lock so a second concurrent
  -- call that blocked above will now see the row the first call created).
  IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id) THEN
    SELECT organization_id INTO v_org_id
    FROM   team_members
    WHERE  id = v_user_id;
    RETURN jsonb_build_object(
      'organization_id', v_org_id,
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

  -- Create Owner team_member with full permissions and no locations yet
  INSERT INTO team_members (
    id, organization_id, name, email, role, location_ids, permissions
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
    }'::jsonb
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'existed',         false
  );
END;
$$;

-- Grants remain identical — same function signature
REVOKE ALL ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) TO authenticated;
