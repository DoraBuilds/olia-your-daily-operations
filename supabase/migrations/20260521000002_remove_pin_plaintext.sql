-- ================================================================
-- Remove pin_plaintext column.
--
-- pin_plaintext stored the raw 4-digit PIN alongside its bcrypt hash
-- so the Account tab could display "Current PIN" to the owner.
-- Any authenticated org member could read all team_members rows via
-- the existing RLS policy, making every member's PIN visible to
-- everyone else in the org.
--
-- The "Current PIN" display is removed from the UI. Owners can still
-- set a new PIN at any time; the kiosk PIN reset flow is unaffected.
-- pin_uniqueness_hash (added in 20260521000001) continues to provide
-- O(1) per-org duplicate detection without exposing plaintext.
-- ================================================================

-- ── 1. Drop the column ────────────────────────────────────────────
ALTER TABLE public.team_members
  DROP COLUMN IF EXISTS pin_plaintext;

-- ── 2. Remove pin_plaintext from the trigger ──────────────────────
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
    NEW.pin_uniqueness_hash := encode(
      digest(NEW.organization_id::text || NEW.pin, 'sha256'),
      'hex'
    );
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;
