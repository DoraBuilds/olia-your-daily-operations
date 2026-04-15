-- ================================================================
-- Add optional email column to staff_profiles
-- ================================================================
-- Staff members can now have an email address so they appear as
-- selectable recipients in the checklist "Notify" logic rule trigger.
-- The column is nullable — existing rows are unaffected.
-- ================================================================

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS email text;
