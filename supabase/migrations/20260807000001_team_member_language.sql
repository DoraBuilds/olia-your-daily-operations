-- ================================================================
-- Per-user staff-app language preference (#594).
--
-- No CHECK constraint on the value: the app validates against its own
-- supported-language list (src/lib/i18n.ts) and adding a new language
-- later should not require a migration.
-- ================================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
