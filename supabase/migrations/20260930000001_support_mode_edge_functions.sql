-- ================================================================
-- Support mode for edge functions (#945)
-- ================================================================
-- Edge functions run with the service-role key, so auth.uid() is NULL
-- and platform_admin_viewing_org() / platform_admin_log() can't be
-- used there. These two service-role-only variants take the (already
-- JWT-verified) user id explicitly, so an edge function can:
--   • find the org a platform admin is viewing and act on it, or
--     refuse outright (billing, delete-my-account);
--   • record what it did in platform_admin_audit_log.
-- ================================================================

-- Same rule as platform_admin_viewing_org(): a session row only counts
-- while the user's confirmed login email is still on platform_admins.
CREATE OR REPLACE FUNCTION public.platform_admin_viewing_org_for(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.organization_id
  FROM public.platform_admin_sessions s
  JOIN auth.users u ON u.id = s.user_id
  JOIN public.platform_admins pa ON pa.email = lower(trim(u.email))
  WHERE s.user_id = p_user_id
    AND u.email_confirmed_at IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.platform_admin_viewing_org_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_viewing_org_for(uuid) TO service_role;

ALTER TABLE public.platform_admin_audit_log
  DROP CONSTRAINT IF EXISTS platform_admin_audit_log_action_check;
ALTER TABLE public.platform_admin_audit_log
  ADD CONSTRAINT platform_admin_audit_log_action_check
  CHECK (action IN ('enter', 'exit', 'reveal_pin', 'edge_function'));

CREATE OR REPLACE FUNCTION public.platform_admin_log_for(
  p_user_id uuid,
  p_org_id  uuid,
  p_action  text,
  p_detail  jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.platform_admin_audit_log
    (admin_user_id, admin_email, organization_id, organization_name, action, detail)
  SELECT p_user_id,
         (SELECT lower(email) FROM auth.users WHERE id = p_user_id),
         p_org_id,
         (SELECT name FROM public.organizations WHERE id = p_org_id),
         p_action,
         p_detail;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_log_for(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_log_for(uuid, uuid, text, jsonb) TO service_role;
