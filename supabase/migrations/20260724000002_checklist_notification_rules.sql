-- ================================================================
-- Add checklist_notification_rules table
--
-- Stores per-organization settings for daily email summaries
-- about unstarted and unfinished checklists.
-- The actual email delivery is triggered by calling the
-- check-checklist-alerts edge function (manually or via pg_cron).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.checklist_notification_rules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled           boolean     NOT NULL DEFAULT false,
  recipient_email   text        NOT NULL DEFAULT '',
  notify_unstarted  boolean     NOT NULL DEFAULT true,
  notify_unfinished boolean     NOT NULL DEFAULT true,
  notify_hour       integer     NOT NULL DEFAULT 20 CHECK (notify_hour BETWEEN 0 AND 23),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

ALTER TABLE public.checklist_notification_rules ENABLE ROW LEVEL SECURITY;

-- Owners can read and write their own org's notification rules
CREATE POLICY "owners can manage notification rules"
  ON public.checklist_notification_rules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.team_members
       WHERE user_id = auth.uid() AND role = 'Owner'
    )
  );

-- Keep updated_at current on every write
CREATE OR REPLACE FUNCTION public.touch_checklist_notification_rules()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_checklist_notification_rules
  BEFORE UPDATE ON public.checklist_notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_checklist_notification_rules();
