-- ─────────────────────────────────────────────────────────────────────────────
-- E2E test seed data for Olia
--
-- Purpose: Populate a staging/dev Supabase project with deterministic data
--          that matches the Playwright E2E fixture expectations.
--
-- Usage (Supabase CLI):
--   supabase db reset          # wipes + re-applies all migrations
--   psql $DATABASE_URL -f supabase/seeds/e2e_seed.sql
--
-- IMPORTANT: The Playwright E2E specs mock all Supabase REST calls via
-- page.route() and do NOT hit a real database.  This seed is provided for:
--   a) smoke-testing against a real staging Supabase project
--   b) debugging auth / RLS issues in a live environment
--
-- Assumes the schema from supabase/migrations/ has already been applied.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Organization ─────────────────────────────────────────────────────────

insert into organizations (id, name, plan, plan_status, created_at)
values (
  'org-e2e-test',
  'E2E Test Organisation',
  'growth',       -- enables fileConvert, aiBuilder, exportCsv
  'active',
  '2026-01-01T00:00:00Z'
)
on conflict (id) do update
  set name = excluded.name,
      plan = excluded.plan,
      plan_status = excluded.plan_status;

-- ─── 2. Locations ────────────────────────────────────────────────────────────

insert into locations (id, organization_id, name)
values
  ('loc-e2e-001', 'org-e2e-test', 'Main Kitchen'),
  ('loc-e2e-002', 'org-e2e-test', 'Terrace Bar')
on conflict (id) do update
  set name = excluded.name;

-- ─── 3. Checklists ───────────────────────────────────────────────────────────
-- One overdue (due 09:00, no log today)
-- One upcoming (due 22:00)
-- One completed (due 12:00, has a log today)

insert into checklists (id, organization_id, location_id, title, time_of_day, due_time, sections, created_at, updated_at)
values
  (
    'ck-e2e-overdue',
    'org-e2e-test',
    'loc-e2e-001',
    'Morning Kitchen Check',
    'morning',
    '09:00',
    '[]',
    '2026-03-25T10:00:00Z',
    '2026-03-25T10:00:00Z'
  ),
  (
    'ck-e2e-upcoming',
    'org-e2e-test',
    'loc-e2e-001',
    'Evening Close',
    'evening',
    '22:00',
    '[]',
    '2026-03-25T10:00:00Z',
    '2026-03-25T10:00:00Z'
  ),
  (
    'ck-e2e-completed',
    'org-e2e-test',
    'loc-e2e-001',
    'Afternoon Service Check',
    'afternoon',
    '12:00',
    '[]',
    '2026-03-25T10:00:00Z',
    '2026-03-25T10:00:00Z'
  )
on conflict (id) do update
  set title     = excluded.title,
      due_time  = excluded.due_time,
      time_of_day = excluded.time_of_day;

-- ─── 4. Checklist logs ───────────────────────────────────────────────────────
-- log-e2e-001: today (2026-03-26), Main Kitchen, score 92, has started_at
-- log-e2e-002: yesterday (2026-03-25), Terrace Bar, score 78, no started_at

insert into checklist_logs (
  id, organization_id, checklist_id, checklist_title,
  completed_by, score, type, answers,
  created_at, location_id, started_at
)
values
  (
    'log-e2e-001',
    'org-e2e-test',
    'ck-e2e-completed',
    'Afternoon Service Check',
    'Jane Smith',
    92,
    'afternoon',
    '[]',
    '2026-03-26T13:00:00Z',
    'loc-e2e-001',
    '2026-03-26T12:50:00Z'
  ),
  (
    'log-e2e-002',
    'org-e2e-test',
    'ck-e2e-completed',
    'Morning Service',
    'Tom B',
    78,
    'morning',
    '[]',
    '2026-03-25T11:00:00Z',
    'loc-e2e-002',
    null
  )
on conflict (id) do update
  set score     = excluded.score,
      created_at = excluded.created_at;

-- ─── 5. Actions ──────────────────────────────────────────────────────────────
-- One overdue open action (due 2026-03-25, still open)

insert into actions (
  id, organization_id, checklist_id, checklist_title,
  title, assigned_to, due, status, created_at
)
values (
  'act-e2e-001',
  'org-e2e-test',
  'ck-e2e-overdue',
  'Morning Kitchen Check',
  'Fix broken thermometer',
  'Jane Smith',
  '2026-03-25T00:00:00Z',
  'open',
  '2026-03-25T09:00:00Z'
)
on conflict (id) do update
  set status = excluded.status,
      due    = excluded.due;

-- ─── 6. Auth user + team member ──────────────────────────────────────────────
-- These rows are only needed for real Supabase smoke tests.
-- In Playwright E2E, auth is injected client-side and team_members is mocked.
--
-- To use in a real project:
--   1. Create the user via Supabase Auth dashboard (email: e2e@olia.app)
--      with the ID below, OR via: supabase auth admin create-user
--   2. Uncomment + run the INSERT below

-- insert into team_members (id, organization_id, name, email, role, location_ids, permissions)
-- values (
--   '00000000-0000-0000-0000-000000000001',
--   'org-e2e-test',
--   'E2E Tester',
--   'e2e@olia.app',
--   'Owner',
--   '{}',
--   '{}'
-- )
-- on conflict (id) do update
--   set name = excluded.name,
--       role = excluded.role;
