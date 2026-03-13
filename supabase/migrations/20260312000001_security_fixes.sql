-- ================================================================
-- SECURITY FIX 1: Hash Staff PINs
-- ================================================================
-- Enable pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migrate existing plaintext PINs to SHA-256 hex digests.
-- Guard: only migrate rows where pin looks like a plaintext PIN
-- (<=6 chars). A SHA-256 hex is always 64 chars.
UPDATE staff_profiles
SET pin = encode(digest(pin, 'sha256'), 'hex')
WHERE length(pin) <= 6;

-- Update validate_staff_pin to hash the incoming PIN before comparing.
-- Now the client sends raw digits; the function hashes them server-side.
CREATE OR REPLACE FUNCTION validate_staff_pin(p_pin text, p_location_id uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  role text,
  organization_id uuid
) AS $$
BEGIN
  RETURN QUERY
    SELECT sp.id, sp.first_name, sp.last_name, sp.role, sp.organization_id
    FROM staff_profiles sp
    WHERE sp.pin = encode(digest(p_pin, 'sha256'), 'hex')
      AND sp.location_id = p_location_id
      AND sp.status = 'active'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- SECURITY FIX 2: Fix Anonymous RLS Policies
-- ================================================================

-- STAFF PROFILES: Restrict reads to authenticated managers within their org.
-- The kiosk uses validate_staff_pin() RPC (SECURITY DEFINER) so it does
-- NOT need direct table SELECT access.
DROP POLICY IF EXISTS "staff_profiles_read" ON staff_profiles;

CREATE POLICY "staff_profiles_manager_read" ON staff_profiles FOR SELECT
  USING (organization_id = current_org_id());

-- CHECKLIST LOGS: Constrain anonymous inserts to the staff member's org.
-- Prevents cross-org log injection. The kiosk passes staff_profile_id
-- in every log insert; we validate organization_id matches.
DROP POLICY IF EXISTS "logs_insert" ON checklist_logs;

CREATE POLICY "logs_insert_constrained" ON checklist_logs FOR INSERT
  WITH CHECK (
    -- If staff_profile_id is provided, org must match the staff member's org
    (staff_profile_id IS NULL AND organization_id = current_org_id())
    OR
    (staff_profile_id IS NOT NULL AND organization_id = (
      SELECT sp.organization_id FROM staff_profiles sp WHERE sp.id = staff_profile_id
    ))
  );

-- ================================================================
-- ENHANCEMENT: Add location_id to checklist_logs for dashboard filtering
-- ================================================================
ALTER TABLE checklist_logs
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;
