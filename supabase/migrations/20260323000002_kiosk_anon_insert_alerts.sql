-- ================================================================
-- Allow kiosk (anon role) to INSERT alert rows
-- ================================================================
-- Issue 7: When a number answer is outside its acceptable range,
-- the kiosk runner inserts a warning alert so it appears on the
-- Dashboard Operational Alerts panel and in Notifications.
--
-- Without this policy, supabase.from("alerts").insert(...) fails
-- silently for the anon role, so out-of-range alerts never fire.
-- ================================================================

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'alerts'
       AND policyname = 'anon_kiosk_insert_alerts'
  ) THEN
    CREATE POLICY anon_kiosk_insert_alerts
      ON public.alerts
      FOR INSERT
      TO anon
      WITH CHECK (organization_id IS NOT NULL);
  END IF;
END $$;
