-- ================================================================
-- Persist checklist start dates.
--
-- The checklist builder already exposes a start-date control, but the
-- selected value was never stored in the database. That meant editing an
-- existing checklist always showed a blank start date even when one had
-- been chosen earlier.
-- ================================================================

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS start_date date NULL;
