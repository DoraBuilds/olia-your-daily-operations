-- ================================================================
-- Close a billing-bypass gap in organizations RLS.
--
-- Before this migration, "org_update" was:
--   USING (id = current_org_id())
-- with no WITH CHECK and no column restriction. RLS operates on
-- ROWS, not columns, so even adding a WITH CHECK wouldn't stop an
-- authenticated Owner/Manager from directly PATCHing their own org's
-- row via the REST API with e.g. {"plan":"enterprise","plan_status":
-- "active"} — completely bypassing Stripe. Only a trigger can
-- enforce a column-level restriction like this (same approach as
-- the team_members self-escalation fix, 20260821000001).
--
-- Billing state (plan, plan_status, stripe_customer_id,
-- stripe_subscription_id, trial_ends_at, location_grace_period_ends_at)
-- is only ever legitimately written by the service-role edge
-- functions (stripe-webhook, confirm-checkout-session). Two columns
-- ARE legitimately written by authenticated users today —
-- departments (src/hooks/useDepartments.ts) and active_location_ids
-- (src/hooks/usePlan.ts) — and must remain writable.
--
-- current_user reflects 'service_role' for requests authenticated
-- with the service-role key (PostgREST does `SET ROLE` per request
-- based on the JWT's role claim) — verified locally. This lets the
-- trigger allow the legitimate server-side path while blocking
-- direct client writes to billing columns.
--
-- The trigger function is intentionally NOT SECURITY DEFINER: inside
-- a SECURITY DEFINER function, current_user resolves to the
-- function's OWNER for the duration of the call, not the actual
-- caller — which would make this check always see the definer's
-- role and never correctly detect service_role vs authenticated.
-- Confirmed by testing: with SECURITY DEFINER, even a genuine
-- service_role update was incorrectly rejected. No elevated
-- privileges are needed here anyway — the function only compares
-- NEW/OLD of the row already being updated.
-- ================================================================

DROP POLICY IF EXISTS "org_update" ON organizations;

CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = current_org_id())
  WITH CHECK (id = current_org_id());

CREATE OR REPLACE FUNCTION public.prevent_organizations_billing_tamper()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user != 'service_role' THEN
    IF NEW.plan                           IS DISTINCT FROM OLD.plan
       OR NEW.plan_status                    IS DISTINCT FROM OLD.plan_status
       OR NEW.stripe_customer_id             IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.stripe_subscription_id         IS DISTINCT FROM OLD.stripe_subscription_id
       OR NEW.trial_ends_at                  IS DISTINCT FROM OLD.trial_ends_at
       OR NEW.location_grace_period_ends_at  IS DISTINCT FROM OLD.location_grace_period_ends_at
    THEN
      RAISE EXCEPTION 'Billing fields can only be changed by the billing system';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_prevent_billing_tamper ON organizations;

CREATE TRIGGER organizations_prevent_billing_tamper
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organizations_billing_tamper();
