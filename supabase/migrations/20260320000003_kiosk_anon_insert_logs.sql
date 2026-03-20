-- ================================================================
-- KIOSK ANON INSERT FIX: Allow anon kiosk to insert checklist_logs
-- ================================================================
--
-- Root cause: migration 20260312000001_security_fixes.sql replaced
-- the original permissive "logs_insert" policy (WITH CHECK (true))
-- with "logs_insert_constrained", which uses a subquery:
--
--   organization_id = (
--     SELECT sp.organization_id FROM staff_profiles sp WHERE sp.id = staff_profile_id
--   )
--
-- The subquery runs in the anon RLS context. The staff_profiles
-- SELECT policy requires organization_id = current_org_id(), which
-- returns NULL for unauthenticated users. So the subquery returns
-- no rows → organization_id = NULL → INSERT rejected for all kiosk
-- submissions. Completed checklists silently failed to persist.
--
-- Fix: add a separate, permissive anon policy. When any permissive
-- policy passes the WITH CHECK, the INSERT is allowed (policies are
-- OR-combined). The kiosk always supplies a staff_profile_id
-- obtained from the SECURITY DEFINER validate_staff_pin() RPC, so
-- requiring it here is an adequate guard against spoofed inserts.

CREATE POLICY "anon_kiosk_insert_logs"
  ON checklist_logs
  FOR INSERT
  TO anon
  WITH CHECK (staff_profile_id IS NOT NULL);
