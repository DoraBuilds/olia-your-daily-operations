-- Lock down one-off cleanup artifacts so they are not exposed through
-- the public schema to anon/authenticated clients.

ALTER TABLE IF EXISTS public.team_members_cleanup_backup ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_members_cleanup_backup FROM PUBLIC;
REVOKE ALL ON TABLE public.team_members_cleanup_backup FROM anon;
REVOKE ALL ON TABLE public.team_members_cleanup_backup FROM authenticated;
GRANT ALL ON TABLE public.team_members_cleanup_backup TO service_role;

REVOKE ALL ON TABLE public.team_member_email_duplicates FROM PUBLIC;
REVOKE ALL ON TABLE public.team_member_email_duplicates FROM anon;
REVOKE ALL ON TABLE public.team_member_email_duplicates FROM authenticated;
GRANT SELECT ON TABLE public.team_member_email_duplicates TO service_role;
