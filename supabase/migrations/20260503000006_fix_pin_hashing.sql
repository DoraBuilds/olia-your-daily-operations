-- ================================================================
-- Fix PIN hashing inconsistency (GitHub issue #320 — "Jay bugs").
--
-- Problems fixed:
--   1. setup_new_organization used SHA-256; validate_admin_pin uses
--      bcrypt → new accounts could never authenticate at the kiosk.
--   2. Existing SHA-256 default PINs rehashed to bcrypt with a new
--      random 4-digit PIN per account.  The raw PIN is passed to the
--      pin column so the hash_team_member_pin trigger intercepts it,
--      stores it in pin_plaintext for the owner to read, then hashes.
--   3. set_admin_pin() enforces PIN uniqueness within an org and
--      hashes server-side so rawPin never reaches the table directly.
-- ================================================================

-- ── 1. Rehash existing SHA-256 default PINs to bcrypt ─────────────
-- SHA-256 hashes are exactly 64 lowercase hex chars.
-- Each account gets its own random 4-digit PIN generated with a
-- cryptographically secure source.
-- The raw PIN is written to pin column directly so that the
-- hash_team_member_pin trigger can capture it in pin_plaintext
-- before hashing — consistent with all other PIN-setting paths.

DO $$
DECLARE
  r   record;
  raw text;
  _b  bytea;
BEGIN
  FOR r IN
    SELECT id FROM public.team_members
    WHERE pin IS NOT NULL
      AND length(pin) = 64
      AND pin ~ '^[0-9a-f]{64}$'
  LOOP
    _b  := gen_random_bytes(2);
    raw := lpad((1000 + (get_byte(_b, 0) * 256 + get_byte(_b, 1)) % 9000)::text, 4, '0');
    UPDATE public.team_members
    SET
      pin                = raw,   -- trigger hashes this and stores it in pin_plaintext
      pin_reset_required = true
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- ── 2. Fix setup_new_organization — random PIN via trigger ─────────

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
  v_raw_pin              text;
  v_pin_bytes            bytea;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(1, hashtext(v_user_id::text));

  IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id) THEN
    SELECT organization_id INTO v_org_id
    FROM team_members
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'organization_id', v_org_id,
      'existed', true
    );
  END IF;

  SELECT
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      split_part(email, '@', 1)
    )
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
    AND lower(tm.role) = 'owner'
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

  -- Random 4-digit PIN (1000–9999) using a cryptographically secure source.
  -- Written as raw digits so the hash_team_member_pin trigger captures it
  -- in pin_plaintext then stores the bcrypt hash in pin.
  v_pin_bytes := gen_random_bytes(2);
  v_raw_pin   := lpad((1000 + (get_byte(v_pin_bytes, 0) * 256 + get_byte(v_pin_bytes, 1)) % 9000)::text, 4, '0');

  INSERT INTO team_members (
    id,
    organization_id,
    name,
    email,
    role,
    location_ids,
    permissions,
    pin,
    pin_reset_required
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
    v_raw_pin,   -- trigger hashes this and stores it in pin_plaintext
    true
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'existed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) TO authenticated;

-- ── 3. set_admin_pin — hash server-side + enforce org uniqueness ───

CREATE OR REPLACE FUNCTION public.set_admin_pin(
  p_member_id uuid,
  p_raw_pin   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_member_id THEN
    RAISE EXCEPTION 'You may only update your own PIN';
  END IF;

  IF length(trim(p_raw_pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.team_members
  WHERE id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Team member not found';
  END IF;

  -- Uniqueness: no other member in the same org may share this PIN
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.organization_id = v_org_id
      AND tm.id <> p_member_id
      AND tm.pin IS NOT NULL
      AND crypt(p_raw_pin, tm.pin) = tm.pin
  ) THEN
    RAISE EXCEPTION 'Another team member is already using this PIN. Please choose a different one.';
  END IF;

  UPDATE public.team_members
  SET
    pin                = p_raw_pin,   -- trigger hashes this and stores it in pin_plaintext
    pin_reset_required = false
  WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(uuid, text) TO authenticated;
