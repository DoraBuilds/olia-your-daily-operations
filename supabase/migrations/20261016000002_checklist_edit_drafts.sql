-- ================================================================
-- Checklist editing drafts.
--
-- Editing a live checklist autosaves into one draft document per checklist
-- instead of the live row, so the kiosk keeps serving the published version
-- until someone publishes. Publish writes the live row (save_checklist) and
-- then clears the draft. Not to be confused with checklist_drafts, which
-- holds kiosk run progress.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.checklist_edit_drafts (
  checklist_id    uuid PRIMARY KEY REFERENCES public.checklists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content         jsonb NOT NULL,
  saved_by        uuid,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklist_edit_drafts_org_idx
  ON public.checklist_edit_drafts (organization_id);

ALTER TABLE public.checklist_edit_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_edit_drafts_select" ON public.checklist_edit_drafts;
CREATE POLICY "checklist_edit_drafts_select" ON public.checklist_edit_drafts
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_org_id()));

-- Writes go through these functions only.
CREATE OR REPLACE FUNCTION public.save_checklist_draft(
  p_checklist_id uuid,
  p_content      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.current_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no organization found';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' OR pg_column_size(p_content) > 2097152 THEN
    RAISE EXCEPTION 'save_checklist_draft: invalid content.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.checklists WHERE id = p_checklist_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Checklist not found or does not belong to your organization';
  END IF;

  INSERT INTO public.checklist_edit_drafts (checklist_id, organization_id, content, saved_by, updated_at)
  VALUES (p_checklist_id, v_org_id, p_content, auth.uid(), now())
  ON CONFLICT (checklist_id) DO UPDATE
    SET content = EXCLUDED.content, saved_by = EXCLUDED.saved_by, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_checklist_draft(p_checklist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.checklist_edit_drafts
  WHERE checklist_id = p_checklist_id
    AND organization_id = public.current_org_id();
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist_draft(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_checklist_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_checklist_draft(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_checklist_draft(uuid) TO authenticated;
