-- ================================================================
-- Company-wide departments (#838).
--
-- Departments were per-location rows (20260915000002). They become
-- company-wide: one row per department on the organization, plus a
-- department_assignments table saying where each one applies:
--
--   concept_id set, location_id NULL  → every location in that concept,
--                                        including ones added later (live)
--   concept_id set, location_id set   → just that location
--
-- A department with no assignments is allowed ("Not assigned") and
-- applies nowhere. location_departments resolves the assignments into
-- (location_id, department) pairs — it keeps the old
-- { id, location_id, name } shape so location-scoped pickers read it
-- the same way they read the old table.
--
-- Clean slate: every existing department is deleted, and team members'
-- and checklists' department_ids are cleared (agreed in #838 — the Owner
-- recreates departments company-wide).
--
-- Writes to assignments and department deletes go through RPCs that
-- then prune department_ids on team members and checklists that point at
-- a department which no longer applies to any of their locations.
-- ================================================================

-- ── 1. Clean slate ──────────────────────────────────────────────
UPDATE public.team_members SET department_ids = '{}' WHERE cardinality(department_ids) > 0;
UPDATE public.checklists SET department_ids = NULL WHERE department_ids IS NOT NULL;
DELETE FROM public.departments;

-- ── 2. departments → org-scoped ─────────────────────────────────
DROP POLICY IF EXISTS "departments_all" ON public.departments;
DROP INDEX IF EXISTS public.departments_location_id_idx;
ALTER TABLE public.departments DROP COLUMN IF EXISTS location_id;
ALTER TABLE public.departments
  ADD COLUMN organization_id uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX departments_organization_id_idx ON public.departments (organization_id);

CREATE UNIQUE INDEX departments_org_name_key ON public.departments (organization_id, lower(name));

-- Readable by everyone in the org (staff modal, checklist builder,
-- reporting); only the Owner creates/renames. Deletes go through
-- delete_department() so links get pruned.
CREATE POLICY "departments_select" ON public.departments FOR SELECT
  USING (organization_id = current_org_id());
CREATE POLICY "departments_insert" ON public.departments FOR INSERT
  WITH CHECK (organization_id = current_org_id() AND is_owner());
CREATE POLICY "departments_update" ON public.departments FOR UPDATE
  USING (organization_id = current_org_id() AND is_owner())
  WITH CHECK (organization_id = current_org_id() AND is_owner());

-- ── 3. department_assignments ───────────────────────────────────
CREATE TABLE public.department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX department_assignments_unique
  ON public.department_assignments (department_id, concept_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX department_assignments_concept_id_idx ON public.department_assignments (concept_id);
CREATE INDEX department_assignments_location_id_idx ON public.department_assignments (location_id);

ALTER TABLE public.department_assignments ENABLE ROW LEVEL SECURITY;

-- Read-only through the API; writes go through set_department_assignments().
CREATE POLICY "department_assignments_select" ON public.department_assignments FOR SELECT
  USING (department_id IN (SELECT id FROM public.departments WHERE organization_id = current_org_id()));

-- ── 4. location_departments: resolved (location, department) pairs ──
CREATE VIEW public.location_departments
WITH (security_invoker = true) AS
SELECT DISTINCT
  d.id,
  l.id AS location_id,
  d.name,
  d.organization_id
FROM public.department_assignments a
JOIN public.departments d ON d.id = a.department_id
JOIN public.locations l
  ON l.organization_id = d.organization_id
 AND (l.id = a.location_id OR (a.location_id IS NULL AND l.concept_id = a.concept_id));

GRANT SELECT ON public.location_departments TO authenticated;

-- ── 5. prune_department_links ───────────────────────────────────
-- Drops department ids from team members / checklists when that
-- department no longer applies to any location they cover.
--   team member: empty location_ids = every location in the org
--   checklist:   location_ids, else its concept's locations, else every
--                location in the org; an emptied list becomes NULL
--                (= visible to every department).
CREATE OR REPLACE FUNCTION public.prune_department_links(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members tm
  SET department_ids = pruned.ids
  FROM (
    SELECT m.id,
      ARRAY(
        SELECT dep.id
        FROM unnest(m.department_ids) WITH ORDINALITY AS dep(id, ord)
        WHERE EXISTS (
          SELECT 1 FROM location_departments ld
          WHERE ld.id = dep.id
            AND ld.organization_id = p_org
            AND (COALESCE(cardinality(m.location_ids), 0) = 0 OR ld.location_id = ANY(m.location_ids))
        )
        ORDER BY dep.ord
      ) AS ids
    FROM team_members m
    WHERE m.organization_id = p_org
      AND COALESCE(cardinality(m.department_ids), 0) > 0
  ) pruned
  WHERE tm.id = pruned.id
    AND tm.department_ids IS DISTINCT FROM pruned.ids;

  UPDATE checklists c
  SET department_ids = CASE WHEN cardinality(pruned.ids) = 0 THEN NULL ELSE pruned.ids END
  FROM (
    SELECT cl.id,
      ARRAY(
        SELECT dep.id
        FROM unnest(cl.department_ids) WITH ORDINALITY AS dep(id, ord)
        WHERE EXISTS (
          SELECT 1 FROM location_departments ld
          JOIN locations l ON l.id = ld.location_id
          WHERE ld.id = dep.id
            AND ld.organization_id = p_org
            AND CASE
              WHEN cl.location_ids IS NOT NULL THEN l.id = ANY(cl.location_ids)
              WHEN cl.concept_id IS NOT NULL THEN l.concept_id = cl.concept_id
              ELSE true
            END
        )
        ORDER BY dep.ord
      ) AS ids
    FROM checklists cl
    WHERE cl.organization_id = p_org
      AND cl.department_ids IS NOT NULL
  ) pruned
  WHERE c.id = pruned.id
    AND c.department_ids IS DISTINCT FROM pruned.ids;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_department_links(uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. set_department_assignments ───────────────────────────────
-- Replaces a department's assignments in one transaction, then prunes.
-- p_assignments: [{ "concept_id": uuid, "location_id": uuid | null }, ...]
-- A whole-concept entry makes location entries for that concept redundant,
-- so they're dropped.
CREATE OR REPLACE FUNCTION public.set_department_assignments(p_department_id uuid, p_assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM departments WHERE id = p_department_id;
  IF v_org IS NULL OR v_org IS DISTINCT FROM current_org_id() OR NOT COALESCE(is_owner(), false) THEN
    RAISE EXCEPTION 'Only the Owner can change department assignments.';
  END IF;

  CREATE TEMP TABLE _requested ON COMMIT DROP AS
  SELECT DISTINCT
    (e ->> 'concept_id')::uuid AS concept_id,
    NULLIF(e ->> 'location_id', '')::uuid AS location_id
  FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS e;

  IF EXISTS (
    SELECT 1 FROM _requested r
    WHERE r.concept_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM concepts co WHERE co.id = r.concept_id AND co.organization_id = v_org)
       OR (r.location_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM locations l WHERE l.id = r.location_id AND l.concept_id = r.concept_id AND l.organization_id = v_org))
  ) THEN
    RAISE EXCEPTION 'Department assignments must reference this organization''s concepts and their locations.';
  END IF;

  DELETE FROM _requested r
  WHERE r.location_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM _requested w WHERE w.concept_id = r.concept_id AND w.location_id IS NULL);

  DELETE FROM department_assignments a
  WHERE a.department_id = p_department_id
    AND NOT EXISTS (
      SELECT 1 FROM _requested r
      WHERE r.concept_id = a.concept_id AND r.location_id IS NOT DISTINCT FROM a.location_id
    );

  INSERT INTO department_assignments (department_id, concept_id, location_id)
  SELECT p_department_id, r.concept_id, r.location_id
  FROM _requested r
  WHERE NOT EXISTS (
    SELECT 1 FROM department_assignments a
    WHERE a.department_id = p_department_id
      AND a.concept_id = r.concept_id AND a.location_id IS NOT DISTINCT FROM r.location_id
  );

  DROP TABLE _requested;

  PERFORM prune_department_links(v_org);
END;
$$;

REVOKE ALL ON FUNCTION public.set_department_assignments(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_department_assignments(uuid, jsonb) TO authenticated;

-- ── 7. delete_department ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_department(p_department_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM departments WHERE id = p_department_id;
  IF v_org IS NULL OR v_org IS DISTINCT FROM current_org_id() OR NOT COALESCE(is_owner(), false) THEN
    RAISE EXCEPTION 'Only the Owner can delete a department.';
  END IF;

  DELETE FROM departments WHERE id = p_department_id;
  PERFORM prune_department_links(v_org);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_department(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_department(uuid) TO authenticated;

-- ── 8. Checklist target guard: departments are org-scoped now ───
CREATE OR REPLACE FUNCTION public.validate_checklist_targets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invalid_target_id uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;

  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE l.id = NEW.location_id
      AND l.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Checklist location does not belong to the current organization.';
  END IF;

  IF NEW.location_ids IS NOT NULL THEN
    SELECT requested_id
    INTO invalid_target_id
    FROM unnest(NEW.location_ids) AS requested_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = requested_id
        AND l.organization_id = NEW.organization_id
    )
    LIMIT 1;

    IF invalid_target_id IS NOT NULL THEN
      RAISE EXCEPTION 'Checklist locations do not belong to the current organization.';
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(requested_id ORDER BY requested_id)
    END
    INTO NEW.location_ids
    FROM (
      SELECT DISTINCT requested_id
      FROM unnest(NEW.location_ids) AS requested_id
    ) deduped_targets;
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    IF NEW.location_ids IS NULL THEN
      NEW.location_ids := ARRAY[NEW.location_id];
    ELSIF NOT (NEW.location_id = ANY(NEW.location_ids)) THEN
      NEW.location_ids := array_append(NEW.location_ids, NEW.location_id);
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(target_id ORDER BY target_id)
    END
    INTO NEW.location_ids
    FROM (
      SELECT DISTINCT target_id
      FROM unnest(NEW.location_ids) AS target_id
    ) deduped_targets;
  ELSIF COALESCE(array_length(NEW.location_ids, 1), 0) = 1 THEN
    NEW.location_id := NEW.location_ids[1];
  END IF;

  IF COALESCE(array_length(NEW.location_ids, 1), 0) = 0 THEN
    NEW.location_ids := NULL;
  END IF;

  -- department_ids: departments are company-wide (#838) and carry their own
  -- organization_id.
  IF NEW.department_ids IS NOT NULL THEN
    SELECT requested_id
    INTO invalid_target_id
    FROM unnest(NEW.department_ids) AS requested_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.departments d
      WHERE d.id = requested_id
        AND d.organization_id = NEW.organization_id
    )
    LIMIT 1;

    IF invalid_target_id IS NOT NULL THEN
      RAISE EXCEPTION 'Checklist departments do not belong to the current organization.';
    END IF;

    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE array_agg(requested_id ORDER BY requested_id)
    END
    INTO NEW.department_ids
    FROM (
      SELECT DISTINCT requested_id
      FROM unnest(NEW.department_ids) AS requested_id
    ) deduped_targets;
  END IF;

  -- concept_id: only meaningful for "all locations" checklists. Explicit
  -- location targeting makes it redundant/ambiguous, so clear it rather than
  -- reject the write.
  IF NEW.location_id IS NOT NULL OR NEW.location_ids IS NOT NULL THEN
    NEW.concept_id := NULL;
  END IF;

  IF NEW.concept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.concepts co
    WHERE co.id = NEW.concept_id
      AND co.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Checklist concept does not belong to the current organization.';
  END IF;

  RETURN NEW;
END;
$$;

