-- ================================================================
-- Remove baked-in demo data from production-like databases.
--
-- The initial schema migration seeded a demo organization, locations,
-- staff profiles, folders, checklists, and related rows. That makes
-- hosted environments look like they contain shared tenant data even
-- when they should start clean.
--
-- This migration removes that demo org and all dependent rows. Local
-- development and test data should come from explicit seed files, not
-- from production migrations.
-- ================================================================

DELETE FROM public.checklist_logs
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.actions
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.alerts
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.audit_log
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.checklists
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.folders
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.staff_profiles
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.locations
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.organizations
WHERE id = '00000000-0000-0000-0000-000000000001';
