-- ================================================================
-- PLAN RENAME: solo → starter, pro → growth
-- Updated to match the check_plan_limit() logic already in place
-- which uses 'growth' and 'enterprise' (starter as the ELSE branch).
-- ================================================================

-- Migrate existing rows
UPDATE organizations SET plan = 'starter' WHERE plan = 'solo';
UPDATE organizations SET plan = 'growth'  WHERE plan = 'pro';

-- Add a check constraint so invalid plan values are rejected at the DB level
-- (drop first in case this migration is re-run)
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('starter', 'growth', 'enterprise'));
