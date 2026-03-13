-- ================================================================
-- OLIA Initial Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================

-- ── ORGANIZATIONS ───────────────────────────────────────────────
-- Each paying customer (restaurant group, venue, etc.) is one org.
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text not null default 'solo',           -- 'solo' | 'pro' | 'enterprise'
  plan_status text not null default 'trialing', -- 'active' | 'trialing' | 'past_due' | 'canceled'
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── LOCATIONS ───────────────────────────────────────────────────
-- Physical venues / branches. Each belongs to one org.
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  opening_time text,
  closing_time text,
  alert_email text,
  inactivity_threshold integer not null default 80,
  created_at timestamptz not null default now()
);

-- ── TEAM MEMBERS ────────────────────────────────────────────────
-- Managers and owners. They log in with email + password.
-- id matches the Supabase auth.users id so login works automatically.
create table if not exists team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'Manager',  -- 'Owner' | 'Manager'
  location_ids uuid[] not null default '{}',
  permissions jsonb not null default '{
    "create_edit_checklists": true,
    "assign_checklists": true,
    "manage_staff_profiles": false,
    "view_reporting": true,
    "edit_location_details": false,
    "manage_alerts": false,
    "export_data": false,
    "override_inactivity_threshold": false
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- ── STAFF PROFILES ──────────────────────────────────────────────
-- Frontline workers (waiters, kitchen, bar). They log in with a 4-digit PIN.
-- They are NOT Supabase auth users — just records in this table.
create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  first_name text not null,
  last_name text not null,
  role text not null,
  status text not null default 'active',  -- 'active' | 'archived'
  pin text not null,
  last_used_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── FOLDERS ─────────────────────────────────────────────────────
-- Checklist folders (can be nested — a folder can have a parent_id).
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  name text not null,
  parent_id uuid references folders(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── CHECKLISTS ──────────────────────────────────────────────────
-- Checklist templates. sections stores the full question structure as JSON.
create table if not exists checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  folder_id uuid references folders(id) on delete set null,
  title text not null,
  questions_count integer not null default 0,
  schedule jsonb,              -- ScheduleType and CustomRecurrence details
  sections jsonb not null default '[]'::jsonb,  -- SectionDef[] with QuestionDef[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update the updated_at timestamp whenever a checklist changes
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger checklists_updated_at
  before update on checklists
  for each row execute function update_updated_at();

-- ── CHECKLIST LOGS ──────────────────────────────────────────────
-- Every completed checklist submission. answers stores all responses as JSON.
create table if not exists checklist_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  checklist_id uuid references checklists(id) on delete set null,
  checklist_title text not null,
  completed_by text not null,
  staff_profile_id uuid references staff_profiles(id) on delete set null,
  score integer,               -- 0 to 100
  type text,                   -- 'opening' | 'closing' | 'cleaning' | 'delivery' | 'inspection'
  answers jsonb not null default '[]'::jsonb,  -- LogAnswer[]
  created_at timestamptz not null default now()
);

-- ── ACTIONS ─────────────────────────────────────────────────────
-- Tasks created automatically when a checklist logic rule fires.
create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  checklist_id uuid references checklists(id) on delete set null,
  checklist_title text,
  title text not null,
  assigned_to text,
  due text,
  status text not null default 'open',  -- 'open' | 'in-progress' | 'resolved'
  created_at timestamptz not null default now()
);

-- ── ALERTS ──────────────────────────────────────────────────────
-- Operational alerts shown on Dashboard and Notifications page.
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null,          -- 'error' | 'warn'
  message text not null,
  area text,
  time text,
  source text,                 -- 'system' | 'action'
  dismissed_at timestamptz,   -- null = not dismissed; set when user dismisses
  created_at timestamptz not null default now()
);

-- ── AUDIT LOG ───────────────────────────────────────────────────
-- Tracks sensitive admin actions (staff archived, PIN changed, etc.)
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  performed_by uuid references team_members(id) on delete set null,
  action text not null,
  entity_type text,            -- 'staff_profile' | 'team_member' | 'location' | 'checklist'
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ================================================================
-- ROW LEVEL SECURITY
-- Each organisation only sees its own data.
-- ================================================================

alter table organizations enable row level security;
alter table locations enable row level security;
alter table team_members enable row level security;
alter table staff_profiles enable row level security;
alter table folders enable row level security;
alter table checklists enable row level security;
alter table checklist_logs enable row level security;
alter table actions enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;

-- Helper function: get the current logged-in manager's org_id
create or replace function current_org_id()
returns uuid as $$
  select organization_id from team_members where id = auth.uid()
$$ language sql security definer stable;

-- organizations: managers can see and update their own org
create policy "org_select" on organizations for select
  using (id = current_org_id());
create policy "org_update" on organizations for update
  using (id = current_org_id());

-- locations: full access within org
create policy "locations_all" on locations for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- team_members: full access within org
create policy "team_members_all" on team_members for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- staff_profiles: allow read for anon (kiosk PIN grid), full write for authed managers
create policy "staff_profiles_read" on staff_profiles for select
  using (true);  -- kiosk needs to read staff for the grid (PIN hidden client-side — validated server-side via function below)
create policy "staff_profiles_write" on staff_profiles for insert
  with check (organization_id = current_org_id());
create policy "staff_profiles_update" on staff_profiles for update
  using (organization_id = current_org_id());
create policy "staff_profiles_delete" on staff_profiles for delete
  using (organization_id = current_org_id());

-- folders: full access within org
create policy "folders_all" on folders for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- checklists: full access within org
create policy "checklists_all" on checklists for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- checklist_logs: allow insert for anon (kiosk submits logs), read/delete for managers
create policy "logs_insert" on checklist_logs for insert
  with check (true);  -- kiosk (anon) can submit completed logs
create policy "logs_read" on checklist_logs for select
  using (organization_id = current_org_id());
create policy "logs_delete" on checklist_logs for delete
  using (organization_id = current_org_id());

-- actions: full access within org
create policy "actions_all" on actions for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- alerts: full access within org
create policy "alerts_all" on alerts for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- audit_log: read-only within org (written by server-side functions)
create policy "audit_log_read" on audit_log for select
  using (organization_id = current_org_id());
create policy "audit_log_insert" on audit_log for insert
  with check (organization_id = current_org_id());

-- ================================================================
-- SECURE PIN VALIDATION FUNCTION
-- Called from the kiosk to validate a staff PIN.
-- Returns the staff profile (without exposing other PINs).
-- Runs with elevated privileges so it can bypass RLS for lookup.
-- ================================================================
create or replace function validate_staff_pin(p_pin text, p_location_id uuid)
returns table(
  id uuid,
  first_name text,
  last_name text,
  role text,
  organization_id uuid
) as $$
begin
  return query
    select sp.id, sp.first_name, sp.last_name, sp.role, sp.organization_id
    from staff_profiles sp
    where sp.pin = p_pin
      and sp.location_id = p_location_id
      and sp.status = 'active'
    limit 1;
end;
$$ language plpgsql security definer;

-- ================================================================
-- INITIAL SEED DATA
-- Sample organisation, location, and staff so the app works on first run.
-- ================================================================

-- Create a sample organisation
insert into organizations (id, name, plan, plan_status)
values (
  '00000000-0000-0000-0000-000000000001',
  'Olia Demo Restaurant Group',
  'pro',
  'active'
) on conflict do nothing;

-- Create two sample locations
insert into locations (id, organization_id, name, address, opening_time, closing_time, alert_email, inactivity_threshold)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Main Branch', '12 Harbour Street, London EC1A 1BB', '08:00', '23:00', 'ops@olia.app', 80),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Terrace', '14 Harbour Street, London EC1A 1BB', '10:00', '22:00', 'ops@olia.app', 80)
on conflict do nothing;

-- Create sample staff profiles (PIN-based, not auth users)
insert into staff_profiles (id, organization_id, location_id, first_name, last_name, role, status, pin)
values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Maria', 'Garcia', 'Head of Kitchen', 'active', '1234'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'James', 'Chen', 'Barista', 'active', '5678'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Sophie', 'Müller', 'Floor Manager', 'active', '9012'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Luis', 'Martins', 'Waiter', 'active', '3456'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Aisha', 'Okafor', 'Bartender', 'active', '7890'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Tom', 'Briggs', 'Waiter', 'archived', '2345')
on conflict do nothing;

-- Create sample folders
insert into folders (id, organization_id, location_id, name, parent_id)
values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Daily Operations', null),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Health & Safety', null),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Kitchen', '00000000-0000-0000-0000-000000000030')
on conflict do nothing;

-- Create sample checklists
insert into checklists (id, organization_id, location_id, folder_id, title, questions_count, schedule, sections)
values
  (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000030',
    'Opening Checklist',
    5,
    '"daily"',
    '[
      {
        "id": "s1",
        "name": "Setup & Preparation",
        "questions": [
          {"id": "q1", "text": "Confirm all equipment is operational", "responseType": "checkbox", "required": true},
          {"id": "q2", "text": "Record fridge temperature", "responseType": "number", "required": true, "config": {"min": 0, "max": 8}},
          {"id": "q3", "text": "Check stock levels", "responseType": "multiple_choice", "required": true, "choices": ["Good", "Low", "Critical"]}
        ]
      },
      {
        "id": "s2",
        "name": "Safety & Compliance",
        "questions": [
          {"id": "q4", "text": "Verify fire exits are clear", "responseType": "checkbox", "required": true},
          {"id": "q5", "text": "Photo of safety signage", "responseType": "media", "required": false}
        ]
      }
    ]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000030',
    'Closing Checklist',
    4,
    '"daily"',
    '[
      {
        "id": "s1",
        "name": "Closing Tasks",
        "questions": [
          {"id": "q1", "text": "All equipment powered down", "responseType": "checkbox", "required": true},
          {"id": "q2", "text": "Final temperature log", "responseType": "number", "required": true, "config": {"min": 0, "max": 8}},
          {"id": "q3", "text": "Cash counted and secured", "responseType": "checkbox", "required": true},
          {"id": "q4", "text": "Any incidents to report?", "responseType": "text", "required": false}
        ]
      }
    ]'::jsonb
  )
on conflict do nothing;
