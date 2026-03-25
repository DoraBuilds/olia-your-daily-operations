-- ================================================================
-- Add started_at to checklist_logs
-- ================================================================
-- Allows the kiosk to persist when the staff member started a
-- checklist (captured in ChecklistRunner via startedAtRef).
-- The kiosk sends started_at: startedAt.toISOString() in the
-- log payload (Kiosk.tsx handleComplete).
--
-- For logs created before this migration, started_at is NULL.
-- The PDF export degrades gracefully: only "Finished HH:MM" is
-- shown; "Started HH:MM" is omitted when the field is null.
-- ================================================================

ALTER TABLE public.checklist_logs
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Refresh PostgREST schema cache so the new column is immediately
-- visible to the REST API without a server restart.
NOTIFY pgrst, 'reload schema';
