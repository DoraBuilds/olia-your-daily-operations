-- ================================================================
-- Unify staff_profiles into team_members (#748/#747).
--
-- Per product decision: one people entity, default tier = kiosk-PIN
-- only (no admin-app login, no permissions — today's staff_profiles
-- behavior), with an opt-in "manager role" that unlocks the existing
-- permissions JSONB + admin-app login (today's team_members behavior).
--
-- Strategy: purely additive and reversible. staff_profiles and its
-- RLS/RPCs (validate_staff_pin, vault_staff_pin) are left completely
-- untouched — checklist_logs.staff_profile_id still points at them,
-- so historical data stays intact. This migration only ADDS a new
-- team_members row per staff_profiles row (same id, so pin_vault and
-- any future lookups by id stay consistent). No client code reads
-- these new rows yet — the client still merges team_members +
-- staff_profiles itself, so this ships as a no-op from the app's
-- point of view. The client cutover (stop writing to staff_profiles,
-- read the unified list from team_members only) is a separate,
-- later change once the new Users/Concepts UI ships.
-- ================================================================

-- ── 1. team_members.id can no longer require a matching auth.users
--    row — kiosk-only members (is_manager = false) have no admin-app
--    login and never will unless promoted. This FK already doesn't
--    block the existing invite flow (a team_members row is created
--    with a fresh id well before the invitee ever has an auth.users
--    row — accept_invite links auth_user_id, a separate nullable
--    column, only once they accept), so dropping it here just makes
--    the constraint match what the app already relies on.
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_id_fkey;

-- ── 2. New columns ────────────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

-- email was NOT NULL because every team_members row used to have
-- admin-app login (the invite email needed somewhere to go). Kiosk-only
-- members (is_manager = false) mirror staff_profiles, where email is
-- optional — most hourly kiosk PIN workers never had one. Only actually
-- required once is_manager = true (there has to be an invite address) —
-- that's enforced client-side by the manager-role toggle, same as
-- location_ids/permissions are already client-enforced, not DB-enforced.
ALTER TABLE public.team_members ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS team_members_department_id_idx ON public.team_members (department_id);

-- Every row that existed before this migration already had full
-- admin-app access — that's what team_members has always meant.
-- Preserve that exactly: is_manager = true for all of them.
UPDATE public.team_members SET is_manager = true WHERE NOT is_manager;

-- ── 3. Best-effort department mapping for the migrated rows ───────
-- Mirrors src/lib/admin-repository.ts getRoleDepartment(): take the
-- role's first " / "-separated segment, map known legacy role names
-- to a department, otherwise the segment IS the department name.
CREATE OR REPLACE FUNCTION public._legacy_role_department(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(split_part(trim(p_role), ' / ', 1))
    WHEN 'waiter'    THEN 'Front of House'
    WHEN 'bartender'  THEN 'Front of House'
    WHEN 'host'       THEN 'Front of House'
    WHEN 'kitchen'    THEN 'Back of House'
    WHEN 'cleaner'    THEN 'Cleaning Crew'
    WHEN 'manager'    THEN 'Management'
    ELSE split_part(trim(p_role), ' / ', 1)
  END;
$$;

-- ── 4. Migrate staff_profiles rows into team_members ───────────────
-- Skips any id already present (idempotent / safe to re-run).
--
-- staff_profiles.role is genuine free text with no relationship to
-- ownership (someone could plausibly title a role "Owner" as in
-- "on-site owner-operator" without that meaning real system-Owner
-- access). The 20260915000003 sync trigger unconditionally re-derives
-- is_owner from role text on every insert/update of either column —
-- exactly the protection we want for the *existing* team_members rows
-- (whose role has only ever been a controlled 'Owner'/'Manager'
-- dropdown value), but it would silently grant real Owner access to
-- a migrated kiosk-only row whose role text happens to collide.
-- Disabled only for this one bulk insert, re-enabled immediately after
-- — DDL is transactional, so any failure before the ENABLE rolls the
-- DISABLE back too, it can never be left off.
ALTER TABLE public.team_members DISABLE TRIGGER team_members_sync_is_owner;

INSERT INTO public.team_members (
  id, organization_id, name, email, role, location_ids,
  department_id, is_manager, is_owner, permissions,
  pin, pin_reset_required, archived_at, created_at
)
SELECT
  sp.id,
  sp.organization_id,
  trim(sp.first_name || ' ' || sp.last_name),
  sp.email,
  sp.role,
  CASE WHEN sp.location_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[sp.location_id] END,
  (
    SELECT d.id FROM public.departments d
    WHERE d.location_id = sp.location_id
      AND lower(d.name) = lower(public._legacy_role_department(sp.role))
    LIMIT 1
  ),
  false,  -- is_manager: kiosk-only by default, matching current staff_profiles behavior
  false,  -- is_owner
  '{
    "create_edit_checklists": false,
    "assign_checklists": false,
    "manage_staff_profiles": false,
    "view_reporting": false,
    "edit_location_details": false,
    "manage_alerts": false,
    "export_data": false,
    "override_inactivity_threshold": false
  }'::jsonb,
  -- Re-hash from the vault's plaintext copy (staff PINs are SHA-256 in
  -- staff_profiles, but team_members PINs are bcrypt via the
  -- hash_team_member_pin trigger — the two formats are incompatible,
  -- so this can't be a straight column copy). Rows with no vault entry
  -- (PINs set before the 20260724000001 vault migration) get pin_reset_required
  -- instead, same as the existing documented pin-vault gap.
  (SELECT crypt(pv.pin, gen_salt('bf', 12)) FROM public.pin_vault pv
   WHERE pv.member_type = 'staff_profile' AND pv.member_id = sp.id),
  NOT EXISTS (SELECT 1 FROM public.pin_vault pv WHERE pv.member_type = 'staff_profile' AND pv.member_id = sp.id),
  CASE WHEN sp.status = 'archived' THEN COALESCE(sp.archived_at, now()) ELSE NULL END,
  sp.created_at
FROM public.staff_profiles sp
WHERE NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.id = sp.id)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.team_members ENABLE TRIGGER team_members_sync_is_owner;

-- Mirror the pin_vault entry under the new member_type so a future
-- admin_reveal_pin('team_member', ...) call for a migrated kiosk-only
-- member works the same way admin_reveal_pin('staff_profile', ...)
-- already does today.
INSERT INTO public.pin_vault (member_type, member_id, org_id, pin, updated_at)
SELECT 'team_member', pv.member_id, pv.org_id, pv.pin, pv.updated_at
FROM public.pin_vault pv
WHERE pv.member_type = 'staff_profile'
ON CONFLICT (member_type, member_id) DO NOTHING;

DROP FUNCTION public._legacy_role_department(text);
