-- ================================================================
-- Guard checklist location targets to the checklist organization.
--
-- Problem:
--   checklists could be written with location_id/location_ids that belong
--   to a different organization. Those rows never appear in kiosk because
--   the kiosk RPC scopes by location.organization_id.
--
-- This migration:
--   1. Cleans up any existing invalid cross-org location assignments.
--   2. Adds a trigger that rejects future mismatched location targets.
--   3. Canonicalizes single-location assignments so location_id and
--      location_ids stay in sync.
-- ================================================================

UPDATE public.checklists c
SET location_id = CASE
      WHEN c.location_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.locations l
        WHERE l.id = c.location_id
          AND l.organization_id = c.organization_id
      )
        THEN c.location_id
      ELSE NULL
    END,
    location_ids = (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE array_agg(valid_id ORDER BY valid_id)
      END
      FROM (
        SELECT DISTINCT l.id AS valid_id
        FROM unnest(COALESCE(c.location_ids, ARRAY[]::uuid[])) AS requested_id
        JOIN public.locations l
          ON l.id = requested_id
         AND l.organization_id = c.organization_id
      ) valid_targets
    )
WHERE
  (c.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE l.id = c.location_id
      AND l.organization_id = c.organization_id
  ))
  OR EXISTS (
    SELECT 1
    FROM unnest(COALESCE(c.location_ids, ARRAY[]::uuid[])) AS requested_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = requested_id
        AND l.organization_id = c.organization_id
    )
  );

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklists_validate_targets ON public.checklists;

CREATE TRIGGER checklists_validate_targets
BEFORE INSERT OR UPDATE ON public.checklists
FOR EACH ROW
EXECUTE FUNCTION public.validate_checklist_targets();
