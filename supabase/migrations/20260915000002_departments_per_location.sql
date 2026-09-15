-- ================================================================
-- Departments move from a single org-wide JSONB column
-- (organizations.departments, added in 20260515000001) to a real
-- table scoped per-location — restaurant size varies per venue, so
-- the department list should too. Part of #748.
--
-- organizations.departments is left in place (not dropped) until the
-- client is fully cut over to reading from this table — see #747.
-- ================================================================

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

alter table departments enable row level security;

create policy "departments_all" on departments for all
  using (
    location_id in (select id from locations where organization_id = current_org_id())
  )
  with check (
    location_id in (select id from locations where organization_id = current_org_id())
  );

create index if not exists departments_location_id_idx on departments (location_id);

-- ── Backfill ────────────────────────────────────────────────────
-- Every location gets its org's current department list (if the org
-- ever customized one) or else the same four app-default departments
-- the client already falls back to (src/lib/admin-repository.ts
-- DEFAULT_STAFF_DEPARTMENTS) — so this is a no-op from the user's
-- point of view until they start editing departments per-location.
insert into departments (location_id, name)
select l.id, dep.name
from locations l
join organizations o on o.id = l.organization_id
cross join lateral (
  select value ->> 'name' as name
  from jsonb_array_elements(
    coalesce(
      nullif(o.departments, 'null'::jsonb),
      '[{"name":"Front of House"},{"name":"Back of House"},{"name":"Management"},{"name":"Cleaning Crew"}]'::jsonb
    )
  )
) dep
where not exists (
  select 1 from departments d where d.location_id = l.id
)
on conflict (location_id, name) do nothing;
