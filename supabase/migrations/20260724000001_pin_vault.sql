-- ================================================================
-- Pin Vault: persistent, owner-only PIN retrieval.
--
-- Owners can look up any member's PIN at any time (e.g. a staff
-- member returns from holiday and forgets their kiosk PIN).
--
-- Security model:
--   - pin_vault stores plaintext PINs, but RLS has NO SELECT/INSERT/
--     UPDATE/DELETE policies, so no client can read or write it directly.
--   - hash_team_member_pin trigger (SECURITY DEFINER) writes to
--     pin_vault before bcrypt-hashing, so team-member PINs are
--     captured automatically on every INSERT or UPDATE OF pin.
--   - vault_staff_pin RPC (SECURITY DEFINER) is called by the client
--     to capture raw staff-profile PINs (which are SHA-256-hashed
--     client-side, so the trigger cannot intercept them).
--   - admin_reveal_pin RPC (SECURITY DEFINER) checks the caller is
--     an Owner in the same org before returning any PIN.
-- ================================================================

-- ── 1. Create pin_vault ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pin_vault (
  member_type  text    NOT NULL CHECK (member_type IN ('team_member', 'staff_profile')),
  member_id    uuid    NOT NULL,
  org_id       uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pin          text    NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_type, member_id)
);

ALTER TABLE public.pin_vault ENABLE ROW LEVEL SECURITY;
-- No policies → authenticated/anon roles cannot touch this table directly.

-- ── 2. Modify hash_team_member_pin to also write to pin_vault ─────
CREATE OR REPLACE FUNCTION public.hash_team_member_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND (
    NEW.pin NOT LIKE '$2a$%' AND
    NEW.pin NOT LIKE '$2b$%' AND
    NEW.pin NOT LIKE '$2x$%' AND
    NEW.pin NOT LIKE '$2y$%'
  ) THEN
    -- Persist raw PIN to vault before hashing.
    INSERT INTO public.pin_vault (member_type, member_id, org_id, pin, updated_at)
    VALUES ('team_member', NEW.id, NEW.organization_id, NEW.pin, now())
    ON CONFLICT (member_type, member_id)
    DO UPDATE SET pin = EXCLUDED.pin, updated_at = now();

    NEW.pin_uniqueness_hash := encode(
      digest(NEW.organization_id::text || NEW.pin, 'sha256'),
      'hex'
    );
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. vault_staff_pin — store raw staff-profile PIN ─────────────
-- Called from the client right after the SHA-256 hashed pin is saved.
-- Verifies the profile belongs to the caller's org before writing.
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

  SELECT organization_id INTO v_caller_org
  FROM public.team_members
  WHERE id = auth.uid();

  IF v_org_id <> v_caller_org THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.pin_vault (member_type, member_id, org_id, pin, updated_at)
  VALUES ('staff_profile', p_profile_id, v_org_id, p_pin, now())
  ON CONFLICT (member_type, member_id)
  DO UPDATE SET pin = EXCLUDED.pin, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.vault_staff_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_staff_pin(uuid, text) TO authenticated;

-- ── 4. admin_reveal_pin — Owner-only PIN lookup ───────────────────
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
  v_caller_org  uuid;
  v_caller_role text;
  v_vault_org   uuid;
  v_pin         text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id, role
  INTO v_caller_org, v_caller_role
  FROM public.team_members
  WHERE id = auth.uid();

  IF v_caller_role <> 'Owner' THEN
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
