-- ================================================================
-- ACTIVE STAFF COUNT PER LOCATION
--
-- "Active staff" = staff_profiles with status 'active' that completed
-- a checklist in the last 30 days (last_used_at is maintained by the
-- checklist_logs trigger, see 20260323000003). Leavers drop off on
-- their own without anyone deactivating them.
--
-- Informational only: used to place a location in a size band
-- (standard / large / custom) at renewal. Nothing is enforced.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_active_staff_counts(p_days integer DEFAULT 30)
RETURNS TABLE (location_id uuid, location_name text, active_staff integer)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT l.id AS location_id,
         l.name AS location_name,
         COUNT(sp.id)::integer AS active_staff
  FROM locations l
  LEFT JOIN staff_profiles sp
    ON sp.location_id = l.id
   AND sp.status = 'active'
   AND sp.last_used_at >= now() - make_interval(days => p_days)
  WHERE l.organization_id = (SELECT current_org_id())
  GROUP BY l.id, l.name
  ORDER BY l.name
$$;

REVOKE ALL ON FUNCTION public.get_active_staff_counts(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_staff_counts(integer) TO authenticated;
