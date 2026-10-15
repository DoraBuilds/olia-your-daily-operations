-- ================================================================
-- Server-side progress for checklists started but not submitted.
--
-- Kiosk drafts only lived in that device's browser, so when a checklist
-- ended up Missed nobody could see how far it got. The kiosk now reports
-- progress (which questions are done, which are not) for the current
-- operating day. Reporting joins it to the recorded miss to show "7/10
-- completed" and exactly which items were skipped. The row is removed when
-- the checklist is submitted, and pruned after 60 days.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.checklist_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  checklist_id    uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  operating_date  date NOT NULL,
  answered_count  integer NOT NULL CHECK (answered_count >= 0),
  total_count     integer NOT NULL CHECK (total_count >= 0),
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  saved_by        text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, location_id, operating_date)
);

CREATE INDEX IF NOT EXISTS checklist_drafts_org_date_idx
  ON public.checklist_drafts (organization_id, operating_date DESC);

ALTER TABLE public.checklist_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_drafts_select" ON public.checklist_drafts;
CREATE POLICY "checklist_drafts_select" ON public.checklist_drafts
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_org_id()));

-- The kiosk (anon) reports progress. Same trust model as submit_kiosk_log:
-- the checklist must belong to the location's organization.
CREATE OR REPLACE FUNCTION public.save_kiosk_draft(
  p_location_id    uuid,
  p_checklist_id   uuid,
  p_operating_date date,
  p_items          jsonb,
  p_answered       integer,
  p_total          integer,
  p_by             text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  IF ABS(p_operating_date - CURRENT_DATE) > 1 THEN
    RAISE EXCEPTION 'save_kiosk_draft: operating date out of range.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) > 300 OR pg_column_size(p_items) > 262144 THEN
    RAISE EXCEPTION 'save_kiosk_draft: invalid items.';
  END IF;
  IF p_answered < 0 OR p_total < 0 OR p_answered > p_total THEN
    RAISE EXCEPTION 'save_kiosk_draft: invalid counts.';
  END IF;

  SELECT l.organization_id INTO _org_id
    FROM public.locations l
    JOIN public.checklists c ON c.organization_id = l.organization_id
   WHERE l.id = p_location_id AND c.id = p_checklist_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'save_kiosk_draft: checklist does not belong to this location''s organization.';
  END IF;

  INSERT INTO public.checklist_drafts (
    organization_id, location_id, checklist_id, operating_date,
    answered_count, total_count, items, saved_by, updated_at
  ) VALUES (
    _org_id, p_location_id, p_checklist_id, p_operating_date,
    p_answered, p_total, p_items, left(COALESCE(p_by, ''), 200), now()
  )
  ON CONFLICT (checklist_id, location_id, operating_date) DO UPDATE
    SET answered_count = EXCLUDED.answered_count,
        total_count    = EXCLUDED.total_count,
        items          = EXCLUDED.items,
        saved_by       = EXCLUDED.saved_by,
        updated_at     = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_kiosk_draft(uuid, uuid, date, jsonb, integer, integer, text) TO anon, authenticated;

-- Called when the checklist is submitted: it is no longer partial.
CREATE OR REPLACE FUNCTION public.clear_kiosk_draft(
  p_location_id    uuid,
  p_checklist_id   uuid,
  p_operating_date date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.checklist_drafts
   WHERE location_id = p_location_id
     AND checklist_id = p_checklist_id
     AND operating_date = p_operating_date
     AND ABS(p_operating_date - CURRENT_DATE) <= 1;
$$;

GRANT EXECUTE ON FUNCTION public.clear_kiosk_draft(uuid, uuid, date) TO anon, authenticated;

-- Reports read back 30 days at most; keep a little more than that.
CREATE OR REPLACE FUNCTION public.prune_checklist_drafts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.checklist_drafts WHERE updated_at < now() - interval '60 days';
$$;

REVOKE ALL ON FUNCTION public.prune_checklist_drafts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-checklist-drafts';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule('prune-checklist-drafts', '17 3 * * *', $$SELECT public.prune_checklist_drafts();$$);
