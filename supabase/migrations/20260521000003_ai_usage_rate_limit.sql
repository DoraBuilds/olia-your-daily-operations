-- ================================================================
-- Per-org daily AI request tracking for rate limiting.
--
-- The plan-guard edge function calls check_and_increment_ai_usage
-- via the service role on every AI request. The function atomically
-- increments today's count and returns false once the daily limit
-- is exceeded, causing the edge function to return 429.
--
-- Default limit: 100 requests per org per day (configurable via the
-- AI_DAILY_LIMIT secret on the edge function environment).
-- ================================================================

CREATE TABLE public.ai_usage (
  organization_id uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_date      date    NOT NULL DEFAULT CURRENT_DATE,
  request_count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, usage_date)
);

-- Accessible only via service_role (plan-guard). No client policies needed.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Atomically upsert today's row and return whether the org is still
-- within its daily limit. Increments before checking so the counter
-- is always accurate; at most one request may slip past the exact limit
-- under concurrent load, which is acceptable for a daily soft cap.
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(
  p_org_id      uuid,
  p_daily_limit integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.ai_usage (organization_id, usage_date, request_count)
  VALUES (p_org_id, CURRENT_DATE, 1)
  ON CONFLICT (organization_id, usage_date)
  DO UPDATE SET request_count = ai_usage.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_daily_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_ai_usage(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_ai_usage(uuid, integer) TO service_role;
