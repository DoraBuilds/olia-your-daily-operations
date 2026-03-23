-- ================================================================
-- Auto-update staff_profiles.last_used_at on checklist completion
-- ================================================================
-- Problem: the kiosk runs as anon and cannot UPDATE staff_profiles
-- directly (RLS blocks it). So last_used_at is never written after
-- a checklist is completed, and the Admin profile card always shows
-- "Never used".
--
-- Fix: an AFTER INSERT trigger on checklist_logs that updates
-- staff_profiles.last_used_at whenever staff_profile_id is not null.
-- The function runs as SECURITY DEFINER so it bypasses RLS.
-- ================================================================

CREATE OR REPLACE FUNCTION public.update_staff_last_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.staff_profile_id IS NOT NULL THEN
    UPDATE public.staff_profiles
       SET last_used_at = NOW()
     WHERE id = NEW.staff_profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_staff_last_used ON public.checklist_logs;

CREATE TRIGGER trg_update_staff_last_used
  AFTER INSERT ON public.checklist_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_last_used();
