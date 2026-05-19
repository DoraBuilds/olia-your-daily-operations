-- ================================================================
-- Store the plaintext PIN alongside the bcrypt hash so the org
-- owner can view their current PIN in the Account tab.
--
-- The 4-digit kiosk PIN is low-security (no financial data), and
-- showing it to the account owner is a valid UX requirement.
--
-- Changes:
--   1. Add pin_plaintext column to team_members
--   2. Update hash_team_member_pin trigger to capture the raw digits
--      before hashing them into pin
-- ================================================================

-- ── 1. Add the column ───────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS pin_plaintext text;

-- ── 2. Update the trigger to also persist the plaintext ─────────
-- Runs BEFORE INSERT OR UPDATE OF pin, so NEW.pin is still the raw
-- value the client sent. Capture it into pin_plaintext, then hash.
CREATE OR REPLACE FUNCTION public.hash_team_member_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND (
    NEW.pin NOT LIKE '$2a$%' AND
    NEW.pin NOT LIKE '$2b$%' AND
    NEW.pin NOT LIKE '$2x$%' AND
    NEW.pin NOT LIKE '$2y$%'
  ) THEN
    NEW.pin_plaintext := NEW.pin;
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;
