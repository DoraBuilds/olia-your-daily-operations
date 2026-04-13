-- ================================================================
-- Reset hosted test data for a clean end-to-end retest.
--
-- Scope:
-- - wipe public app data while preserving schema/migrations
-- - remove uploaded storage objects
-- - remove auth users and related auth artifacts so signup/login starts fresh
--
-- This is intended as a one-time hosted cleanup migration.
-- ================================================================

TRUNCATE TABLE
  public.audit_log,
  public.alerts,
  public.actions,
  public.checklist_logs,
  public.checklists,
  public.folders,
  public.infohub_documents,
  public.infohub_folders,
  public.staff_profiles,
  public.training_progress,
  public.locations,
  public.team_members,
  public.organizations,
  public.team_members_cleanup_backup
RESTART IDENTITY CASCADE;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth.refresh_tokens',
    'auth.sessions',
    'auth.identities',
    'auth.one_time_tokens',
    'auth.flow_state',
    'auth.mfa_factors',
    'auth.mfa_challenges',
    'auth.mfa_amr_claims',
    'auth.sso_domains',
    'auth.sso_providers',
    'auth.audit_log_entries'
  ]
  LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE 'DELETE FROM ' || table_name;
    END IF;
  END LOOP;

  IF to_regclass('auth.users') IS NOT NULL THEN
    DELETE FROM auth.users;
  END IF;
END $$;
