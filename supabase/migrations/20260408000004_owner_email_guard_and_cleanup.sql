-- ============================================================
-- Prevent duplicate active owner emails and archive the known
-- orphaned duplicate owner row for dora_angelov@yahoo.com.
-- ============================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.team_members_cleanup_backup AS
SELECT *
FROM public.team_members
WHERE false;

ALTER TABLE public.team_members_cleanup_backup
  ADD COLUMN IF NOT EXISTS pin text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

INSERT INTO public.team_members_cleanup_backup (
  id,
  organization_id,
  name,
  email,
  role,
  location_ids,
  permissions,
  created_at,
  pin,
  archived_at
)
SELECT
  tm.id,
  tm.organization_id,
  tm.name,
  tm.email,
  tm.role,
  tm.location_ids,
  tm.permissions,
  tm.created_at,
  tm.pin,
  tm.archived_at
FROM public.team_members tm
WHERE tm.id = 'a08240dd-07da-47b0-90b2-c5c1d0cc658d'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_members_cleanup_backup backup
    WHERE backup.id = tm.id
  );

UPDATE public.team_members tm
SET
  email = 'archived+' || tm.id::text || '@invalid.olia',
  name = CASE
    WHEN tm.name LIKE '%(archived duplicate)' THEN tm.name
    ELSE tm.name || ' (archived duplicate)'
  END,
  archived_at = COALESCE(tm.archived_at, now())
WHERE tm.id = 'a08240dd-07da-47b0-90b2-c5c1d0cc658d'::uuid
  AND lower(trim(tm.email)) = 'dora_angelov@yahoo.com'
  AND lower(tm.role) = 'owner'
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = tm.id
  )
  AND EXISTS (
    SELECT 1
    FROM auth.users au
    JOIN public.team_members canonical
      ON canonical.id = au.id
    WHERE lower(trim(canonical.email)) = 'dora_angelov@yahoo.com'
      AND lower(canonical.role) = 'owner'
      AND canonical.archived_at IS NULL
      AND canonical.id <> tm.id
  );

CREATE OR REPLACE VIEW public.team_member_email_duplicates AS
SELECT
  lower(trim(email)) AS normalized_email,
  count(*) AS row_count,
  array_agg(id ORDER BY created_at ASC) AS team_member_ids,
  array_agg(organization_id ORDER BY created_at ASC) AS organization_ids
FROM public.team_members
WHERE archived_at IS NULL
  AND lower(role) = 'owner'
GROUP BY lower(trim(email))
HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_active_owner_email_unique
  ON public.team_members (lower(trim(email)))
  WHERE archived_at IS NULL
    AND lower(role) = 'owner';

CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_business_name TEXT,
  p_location_name TEXT DEFAULT NULL,
  p_owner_name    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id              uuid := auth.uid();
  v_user_email           text;
  v_owner_name           text;
  v_org_id               uuid;
  v_conflicting_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(1, hashtext(v_user_id::text));

  IF EXISTS (SELECT 1 FROM team_members WHERE id = v_user_id) THEN
    SELECT organization_id INTO v_org_id
    FROM team_members
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'organization_id', v_org_id,
      'existed', true
    );
  END IF;

  SELECT
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      split_part(email, '@', 1)
    )
  INTO v_user_email, v_owner_name
  FROM auth.users
  WHERE id = v_user_id;

  IF p_owner_name IS NOT NULL AND trim(p_owner_name) != '' THEN
    v_owner_name := trim(p_owner_name);
  END IF;

  SELECT tm.id
  INTO v_conflicting_owner_id
  FROM public.team_members tm
  WHERE lower(trim(tm.email)) = lower(trim(v_user_email))
    AND lower(tm.role) = 'owner'
    AND tm.archived_at IS NULL
    AND tm.id <> v_user_id
  LIMIT 1;

  IF v_conflicting_owner_id IS NOT NULL THEN
    RAISE EXCEPTION
      'An owner account with email % already exists. Please contact support so we can safely verify your organization access.',
      v_user_email;
  END IF;

  INSERT INTO organizations (name, plan, plan_status)
  VALUES (trim(p_business_name), 'starter', 'active')
  RETURNING id INTO v_org_id;

  INSERT INTO team_members (
    id,
    organization_id,
    name,
    email,
    role,
    location_ids,
    permissions
  ) VALUES (
    v_user_id,
    v_org_id,
    v_owner_name,
    v_user_email,
    'Owner',
    ARRAY[]::uuid[],
    '{
      "create_edit_checklists": true,
      "assign_checklists": true,
      "manage_staff_profiles": true,
      "view_reporting": true,
      "edit_location_details": true,
      "manage_alerts": true,
      "export_data": true,
      "override_inactivity_threshold": true
    }'::jsonb
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'existed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_new_organization(TEXT, TEXT, TEXT) TO authenticated;
