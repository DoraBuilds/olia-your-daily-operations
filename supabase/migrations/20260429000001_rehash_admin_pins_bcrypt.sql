-- ─── Re-hash admin PINs using bcrypt (SEQ-001) ───────────────────────────────
--
-- Migration 20260417000001_plaintext_admin_pin.sql reverted PIN storage from
-- SHA-256 hashes back to plaintext, citing "usability" as the trade-off.
-- This migration reverses that decision by storing PINs as bcrypt hashes
-- (pgcrypto crypt/gen_salt) and updating the comparison functions to match.
--
-- Why bcrypt over SHA-256:
--   • Adaptive cost factor (bf,12) makes brute-force infeasible.
--   • Built-in salt prevents rainbow-table attacks.
--   • pgcrypto ships with every Supabase project — no extra extensions.
--
-- What this migration does:
--   1. Ensures pgcrypto is enabled.
--   2. Hashes all existing plaintext PINs with bcrypt (skips already-hashed rows).
--   3. Replaces validate_admin_pin() to compare via crypt(p_pin, stored_hash).
--   4. Replaces setup_new_organization() to store new owner PINs as bcrypt hashes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Ensure pgcrypto is available (ships with Supabase; safe to run twice)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Hash all existing plaintext PINs with bcrypt.
-- We skip rows whose pin already looks like a bcrypt hash ($2a$ or $2b$ prefix)
-- or a SHA-256 hex digest (64-char hex) — those need a reset anyway and will be
-- caught by pin_reset_required = true.
UPDATE public.team_members
SET pin = crypt(pin, gen_salt('bf', 12))
WHERE pin IS NOT NULL
  AND pin NOT LIKE '$2a$%'
  AND pin NOT LIKE '$2b$%'
  AND pin NOT LIKE '$2x$%'
  AND pin NOT LIKE '$2y$%'
  AND length(pin) <> 64;   -- skip SHA-256 hex digests that can't be reversed

-- SHA-256 rows cannot be re-hashed (we don't know the original value).
-- Mark them as requiring a reset so the owner sets a new PIN via the UI.
UPDATE public.team_members
SET pin_reset_required = true
WHERE pin IS NOT NULL
  AND length(pin) = 64
  AND pin ~ '^[0-9a-f]{64}$';

-- Step 3: Replace validate_admin_pin to use bcrypt comparison.
-- Signature is unchanged: (p_pin text, p_location_id uuid)
DROP FUNCTION IF EXISTS public.validate_admin_pin(text, uuid);

CREATE OR REPLACE FUNCTION public.validate_admin_pin(p_pin text, p_location_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  email text,
  role text,
  location_ids uuid[],
  permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN QUERY
      SELECT
        tm.id,
        tm.organization_id,
        tm.name,
        tm.email,
        tm.role,
        tm.location_ids,
        tm.permissions
      FROM public.locations target
      JOIN public.team_members tm
        ON tm.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND target.organization_id = public.current_org_id()
       AND tm.pin IS NOT NULL
       AND crypt(p_pin, tm.pin) = tm.pin   -- bcrypt comparison
       AND (
         tm.role = 'Owner'
         OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
       )
     ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
     LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT
        tm.id,
        tm.organization_id,
        tm.name,
        tm.email,
        tm.role,
        tm.location_ids,
        tm.permissions
      FROM public.locations target
      JOIN public.team_members tm
        ON tm.organization_id = target.organization_id
     WHERE target.id = p_location_id
       AND tm.pin IS NOT NULL
       AND crypt(p_pin, tm.pin) = tm.pin   -- bcrypt comparison
       AND (
         tm.role = 'Owner'
         OR p_location_id = ANY(COALESCE(tm.location_ids, ARRAY[]::uuid[]))
       )
     ORDER BY (tm.role = 'Owner') DESC, tm.created_at ASC
     LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_pin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_admin_pin(text, uuid) TO anon, authenticated;

-- Step 4: Replace setup_new_organization to store the default PIN as a bcrypt hash.
-- Preserves the full logic from 20260413000003_default_admin_pin.sql:
--   • advisory lock for idempotency
--   • owner email conflict guard
--   • starter plan, empty location_ids, full permissions
--   • pin_reset_required = true so the owner must change the default PIN
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
    crypt('1234', gen_salt('bf', 12)),   -- bcrypt hash of default PIN
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

-- Step 5: Auto-hash PIN column on INSERT/UPDATE via trigger.
-- Any raw PIN (not already a bcrypt hash) written to team_members.pin is
-- transparently hashed before the row is stored. This means the client can
-- send the 4-digit raw PIN via a normal .update() call and the server will
-- always persist only the bcrypt hash — never the plaintext value.
CREATE OR REPLACE FUNCTION public.hash_team_member_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process rows where pin has changed / is being set
  IF NEW.pin IS NOT NULL AND (
    NEW.pin NOT LIKE '$2a$%' AND
    NEW.pin NOT LIKE '$2b$%' AND
    NEW.pin NOT LIKE '$2x$%' AND
    NEW.pin NOT LIKE '$2y$%'
  ) THEN
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_team_member_pin ON public.team_members;
CREATE TRIGGER trg_hash_team_member_pin
  BEFORE INSERT OR UPDATE OF pin ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.hash_team_member_pin();
