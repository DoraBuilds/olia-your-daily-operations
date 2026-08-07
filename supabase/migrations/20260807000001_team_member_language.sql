-- ================================================================
-- Per-user staff-app language preference (#594).
--
-- No CHECK constraint on the value: the app validates against its own
-- supported-language list (src/lib/i18n.ts) and adding a new language
-- later should not require a migration.
-- ================================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

-- Note: this file's original merge (#596) landed the same day as a Supabase
-- CLI v2.112.0 regression that broke `supabase link` in CI (supabase/cli#6115,
-- fixed here via #598), so the migration never actually reached prod on that
-- push. This comment-only touch re-opens the "did migrations change" CI gate
-- so the next deploy retries `db push` — ADD COLUMN IF NOT EXISTS makes that
-- safe to run again.
