-- ================================================================
-- Fast list queries: evaluate RLS helpers once per query, not once
-- per row, and index organization_id on the hot tables (#676).
--
-- Problem:
--   Every org-scoped policy reads `organization_id = current_org_id()`.
--   current_org_id() is a SECURITY DEFINER function, so Postgres can't
--   inline it and calls it for EVERY row it scans — and with no index on
--   organization_id it scans every organisation's rows, not just the
--   caller's. Each call is itself two lookups (platform_admin_sessions,
--   then team_members) since support mode (#941). So "list my 40
--   checklists" costs one function call per checklist in the whole
--   database, and the Reporting log list one per log ever submitted —
--   the same shape as the kiosk PIN scan fixed in #865: time grows with
--   total data, not with what the caller can see.
--
-- Fix:
--   1. Rewrite each policy so the helper sits in a scalar subquery —
--      `organization_id = (SELECT current_org_id())`. Postgres runs that
--      once per statement (an InitPlan) and reuses the value. The
--      helpers are STABLE, so the result is identical.
--   2. Index organization_id so the scan only touches the caller's rows.
--   3. Info Hub SELECT policies call infohub_can_access_folder/document
--      per row (they must — access depends on the row), but for every
--      organisation's rows. Both already require the row's org to be
--      current_org_id() (infohub_scope_allows), so stating that in the
--      policy changes nothing about who sees what and lets the index
--      discard other orgs' rows before the function runs.
-- ================================================================

-- ── 1. Helpers become InitPlans in every policy ─────────────────
-- Rewrites whatever policies exist rather than re-declaring each one, so
-- it can't drift from what is actually deployed. Only calls whose
-- arguments are constants are wrapped; the lookbehind skips calls that
-- are already inside a SELECT, so re-running is a no-op.
DO $$
DECLARE
  pol record;
  v_pattern constant text :=
    '(?<!SELECT )((?:public\.)?(?:current_org_id|is_owner|current_team_member_id)\(\)'
    || '|auth\.uid\(\)'
    || '|(?:public\.)?has_permission\(''[a-z_]+''::text\))';
  v_qual  text;
  v_check text;
  v_sql   text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
       OR (schemaname = 'storage' AND tablename = 'objects')
  LOOP
    v_qual  := regexp_replace(pol.qual,       v_pattern, '(SELECT \1)', 'g');
    v_check := regexp_replace(pol.with_check, v_pattern, '(SELECT \1)', 'g');

    CONTINUE WHEN v_qual IS NOT DISTINCT FROM pol.qual
              AND v_check IS NOT DISTINCT FROM pol.with_check;

    v_sql := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      -- storage.objects belongs to the storage admin role; if this role
      -- can't alter its policies they simply stay as they are.
      RAISE NOTICE 'skipped policy % on %.%: %', pol.policyname, pol.schemaname, pol.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── 2. Info Hub reads: discard other orgs' rows before the per-row check ──
ALTER POLICY infohub_folders_select ON public.infohub_folders
  USING (organization_id = (SELECT current_org_id()) AND infohub_can_access_folder(id));

ALTER POLICY infohub_documents_select ON public.infohub_documents
  USING (organization_id = (SELECT current_org_id()) AND infohub_can_access_document(id));

-- ── 3. Indexes on the org scope ─────────────────────────────────
-- Lists that are read newest-first get created_at in the index too.
CREATE INDEX IF NOT EXISTS checklist_logs_org_created_at_idx
  ON public.checklist_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_org_created_at_idx
  ON public.alerts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS actions_org_created_at_idx
  ON public.actions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_org_created_at_idx
  ON public.audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS checklists_organization_id_idx
  ON public.checklists (organization_id);
CREATE INDEX IF NOT EXISTS folders_organization_id_idx
  ON public.folders (organization_id);
CREATE INDEX IF NOT EXISTS locations_organization_id_idx
  ON public.locations (organization_id);
CREATE INDEX IF NOT EXISTS concepts_organization_id_idx
  ON public.concepts (organization_id);
CREATE INDEX IF NOT EXISTS team_members_organization_id_idx
  ON public.team_members (organization_id);
CREATE INDEX IF NOT EXISTS staff_profiles_organization_id_idx
  ON public.staff_profiles (organization_id);
CREATE INDEX IF NOT EXISTS team_member_invites_organization_id_idx
  ON public.team_member_invites (organization_id);
