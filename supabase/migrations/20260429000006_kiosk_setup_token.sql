-- ─── Kiosk setup token for location identity validation (SEQ-009) ────────────
--
-- Problem:
--   PinEntryModal reads kiosk_location_id from localStorage and uses it as the
--   location for PIN validation.  A physical attacker at a kiosk terminal can
--   change this value via browser DevTools to point to any location UUID and
--   then brute-force PINs for that location.
--
-- Fix:
--   1. Add a kiosk_token UUID column to locations (random, server-generated).
--   2. Add a verify_kiosk_token(p_location_id, p_kiosk_token) SECURITY DEFINER
--      function that returns TRUE only when both the location_id and the token
--      match a real locations row.
--
--   The kiosk setup flow now fetches this token at launch time and stores it
--   alongside kiosk_location_id in localStorage.  Before every PIN validation
--   attempt the client calls verify_kiosk_token.  An attacker who modifies only
--   kiosk_location_id in DevTools will fail this check because they do not know
--   the random token that was issued for that location at setup time.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add kiosk_token column to locations.
-- DEFAULT gen_random_uuid() means every existing and future row gets a
-- distinct, unpredictable token automatically.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS kiosk_token UUID DEFAULT gen_random_uuid();

-- Backfill any existing rows that somehow have NULL (defensive).
UPDATE public.locations
SET kiosk_token = gen_random_uuid()
WHERE kiosk_token IS NULL;

-- Not-null constraint now that every row is populated.
ALTER TABLE public.locations
  ALTER COLUMN kiosk_token SET NOT NULL;

-- Index for fast token lookups.
CREATE INDEX IF NOT EXISTS locations_kiosk_token_idx
  ON public.locations (kiosk_token);

-- Step 2: SECURITY DEFINER function to verify a (location_id, kiosk_token) pair.
-- Returns TRUE  → the token is valid for this location.
-- Returns FALSE → either the location doesn't exist or the token is wrong.
-- Available to both anon (unauthenticated kiosk) and authenticated roles.
CREATE OR REPLACE FUNCTION public.verify_kiosk_token(
  p_location_id UUID,
  p_kiosk_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.locations
    WHERE id          = p_location_id
      AND kiosk_token = p_kiosk_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_kiosk_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_kiosk_token(UUID, UUID) TO anon, authenticated;
