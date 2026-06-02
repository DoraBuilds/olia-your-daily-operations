-- ================================================================
-- Replace O(n) bcrypt PIN uniqueness scan with an indexed hash lookup.
--
-- Problem: set_admin_pin enforced per-org PIN uniqueness by iterating
-- every team_member and calling crypt(p_raw_pin, tm.pin) = tm.pin.
-- Cost scales linearly with team size and leaks team size via timing.
--
-- Fix:
--   1. Add pin_uniqueness_hash column — SHA-256(org_id || raw_pin).
--      SHA-256 is appropriate here: it is not used for authentication
--      (bcrypt in pin handles that), only for fast duplicate detection.
--   2. Partial unique index on (organization_id, pin_uniqueness_hash)
--      enforces uniqueness at the DB level in O(log n).
--   3. hash_team_member_pin trigger populates pin_uniqueness_hash from
--      the raw PIN before hashing, keeping it in sync automatically.
--   4. set_admin_pin drops the bcrypt loop and uses an indexed lookup
--      instead, then relies on the unique index as a final guard.
--
-- Existing rows keep pin_uniqueness_hash = NULL (bcrypt hashes cannot
-- be reversed to recompute it). The partial index excludes NULLs, so
-- legacy rows are exempt until the owner next sets a PIN.
-- ================================================================

-- ── 1. Add column ─────────────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS pin_uniqueness_hash text;

-- ── 2. Partial unique index ────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_pin_uniqueness
  ON public.team_members (organization_id, pin_uniqueness_hash)
  WHERE pin_uniqueness_hash IS NOT NULL;

-- ── 3. Update trigger to populate pin_uniqueness_hash ─────────────
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
    NEW.pin_plaintext      := NEW.pin;
    NEW.pin_uniqueness_hash := encode(
      digest(NEW.organization_id::text || NEW.pin, 'sha256'),
      'hex'
    );
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Replace set_admin_pin with O(1) uniqueness check ───────────
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
  v_org_id      uuid;
  v_uniqueness  text;
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

  -- O(1) indexed lookup replaces the former O(n) bcrypt scan.
  v_uniqueness := encode(digest(v_org_id::text || p_raw_pin, 'sha256'), 'hex');

  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE organization_id    = v_org_id
      AND id                <> p_member_id
      AND pin_uniqueness_hash = v_uniqueness
  ) THEN
    RAISE EXCEPTION 'Another team member is already using this PIN. Please choose a different one.';
  END IF;

  -- Write raw PIN; trigger hashes it, sets pin_plaintext and pin_uniqueness_hash.
  UPDATE public.team_members
  SET
    pin                = p_raw_pin,
    pin_reset_required = false
  WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(uuid, text) TO authenticated;
