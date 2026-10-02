-- Dashboard alerts could not be cleared by anyone without the manage_alerts
-- permission: the alerts_update policy requires it, and PostgREST reports a
-- policy-filtered UPDATE as success with 0 rows, so the alert silently came
-- back on the next refetch. Anyone who can SEE an alert (same org) must be
-- able to clear it, but only the dismissed_at column may change — so expose
-- a narrow RPC instead of loosening the table policy.
CREATE OR REPLACE FUNCTION public.dismiss_alerts(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'dismiss_alerts: not authenticated';
  END IF;

  UPDATE alerts
     SET dismissed_at = now()
   WHERE id = ANY(p_ids)
     AND dismissed_at IS NULL
     AND organization_id = (SELECT current_org_id());

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_alerts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_alerts(uuid[]) TO authenticated;
