-- ================================================================
-- Team members can belong to more than one department (#778) — e.g. a
-- general manager should see checklists from every department they
-- cover, not just one. Replace the single department_id FK with a
-- department_ids array, same pattern as the existing location_ids
-- column (no array FK — membership is validated client-side against
-- useDepartmentsForLocations, same as location_ids already is).
-- ================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS department_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.team_members
SET department_ids = ARRAY[department_id]
WHERE department_id IS NOT NULL;

DROP INDEX IF EXISTS public.team_members_department_id_idx;

ALTER TABLE public.team_members
  DROP COLUMN IF EXISTS department_id;
