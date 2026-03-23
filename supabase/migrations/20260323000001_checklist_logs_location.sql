-- ================================================================
-- Add location_id to checklist_logs
-- ================================================================
-- The kiosk submit payload included location_id, but the column
-- did not exist, causing every kiosk completion insert to fail
-- silently (Supabase returns an error which the client caught and
-- enqueued for retry — but retries also failed). This migration
-- adds the column so location context is captured with each log.
-- ================================================================

ALTER TABLE public.checklist_logs
  ADD COLUMN IF NOT EXISTS location_id uuid
    REFERENCES public.locations(id) ON DELETE SET NULL;
