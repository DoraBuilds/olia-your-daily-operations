-- ================================================================
-- checklists.question_count — lets the Checklists list skip `sections`.
--
-- The list only needed `sections` to show "N questions" per row, so it
-- downloaded every checklist's full question content (options, logic
-- rules, follow-ups, image URLs…) on every load. The full content is now
-- fetched only when a checklist is opened, edited, previewed or exported.
--
-- The count is kept by a trigger so it is right no matter who writes
-- `sections` (save_checklist, direct updates, imports). It counts what the
-- UI counted: top-level questions across all sections.
-- ================================================================

CREATE OR REPLACE FUNCTION public.checklist_question_count(p_sections jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(jsonb_array_length(s -> 'questions')), 0)::integer
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p_sections) = 'array' THEN p_sections ELSE '[]'::jsonb END
       ) AS s
  WHERE jsonb_typeof(s -> 'questions') = 'array'
$$;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS question_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.checklists_set_question_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.question_count := public.checklist_question_count(NEW.sections);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklists_question_count ON public.checklists;
CREATE TRIGGER checklists_question_count
  BEFORE INSERT OR UPDATE OF sections ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.checklists_set_question_count();

-- Backfill existing rows. The trigger is UPDATE OF sections, so touching
-- question_count alone doesn't fire it — set it directly.
UPDATE public.checklists
SET question_count = public.checklist_question_count(sections)
WHERE question_count IS DISTINCT FROM public.checklist_question_count(sections);
