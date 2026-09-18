-- ================================================================
-- Soft-delete accounts: 30-day retention before permanent purge.
--
-- delete_my_account() previously cascaded DELETE FROM organizations
-- immediately (see 20260519000002), which is inconsistent with what
-- Privacy.tsx has told users all along ("...is permanently deleted
-- within 30 days") and gives no recovery window for an accidental or
-- coerced deletion. This migration:
--
--   1. Adds organizations.deletion_requested_at — when set, the org
--      is "soft deleted": the owner's auth.users row is already gone
--      (so nobody can authenticate into it — RLS/current_org_id()
--      never resolves for a deleted org, no extra RLS needed), but
--      every row is still physically in Postgres.
--   2. Rewrites delete_my_account() to set that column and delete
--      auth.users, instead of cascading the org delete immediately.
--   3. Adds purge_expired_deleted_organizations(), which hard-deletes
--      (cascade) any org whose deletion was requested 30+ days ago,
--      and schedules it daily via pg_cron (mirrors the pattern in
--      20260916000001_checklist_alerts_cron.sql).
--
-- Stripe subscription cancellation happens in the new delete-my-account
-- edge function (before it calls this RPC) — a SQL function can't reach
-- the Stripe API. See supabase/functions/delete-my-account/index.ts.
-- ================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_org_id    UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Not authenticated');
  END IF;

  -- Resolve org — uses the same helper all RLS policies rely on
  v_org_id := public.current_org_id();

  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'No organisation found');
  END IF;

  -- Soft delete: mark for purge in 30 days. Every org-scoped row (locations,
  -- team_members, staff_profiles, folders, checklists, checklist_logs,
  -- team_member_invites, etc.) stays in place until the purge sweep below.
  UPDATE public.organizations
  SET deletion_requested_at = now()
  WHERE id = v_org_id;

  -- Remove the auth account now — this is what actually signs the owner out
  -- and blocks them from logging back in. Since current_org_id() resolves
  -- via `team_members WHERE id = auth.uid()`, deleting this row also makes
  -- the (still-present) org data unreachable through the API immediately,
  -- with no separate RLS change needed.
  DELETE FROM auth.users WHERE id = v_caller_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ── Purge sweep ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_organizations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.organizations
  WHERE deletion_requested_at IS NOT NULL
    AND deletion_requested_at < now() - interval '30 days';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-runnable: drop any existing job with this name before scheduling, so a
-- local `supabase db reset` (which replays every migration) doesn't error
-- on a duplicate jobname.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-deleted-organizations-daily';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'purge-deleted-organizations-daily',
  '30 3 * * *',
  $$SELECT public.purge_expired_deleted_organizations();$$
);
