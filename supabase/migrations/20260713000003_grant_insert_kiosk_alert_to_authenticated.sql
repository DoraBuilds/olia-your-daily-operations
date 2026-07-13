-- ================================================================
-- Grant insert_kiosk_alert to authenticated role.
--
-- The original migration (20260429000002) only granted this to anon.
-- When the kiosk is operated while an admin session is active (e.g.
-- owner testing their own kiosk), the Supabase client uses the
-- authenticated role — the RPC would fail silently, no alert row
-- is inserted, and no email is sent.
-- ================================================================

GRANT EXECUTE ON FUNCTION public.insert_kiosk_alert(uuid, text, text, text, uuid, text) TO authenticated;
