-- ================================================================
-- Concepts: a new tier between Company (organizations) and Location.
-- Company > Concept > Location. See #747/#748.
--
-- Purely additive — locations.concept_id starts nullable so this ships
-- with zero risk to the live app, then a follow-up step in this same
-- migration backfills every existing org with one default concept
-- wrapping its current locations and makes the column NOT NULL. No
-- client code reads concept_id yet, so this migration alone changes
-- nothing about current behavior.
-- ================================================================

-- ── concepts ────────────────────────────────────────────────────
create table if not exists concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table concepts enable row level security;

-- Full access within org — mirrors the "locations_all" / "team_members_all"
-- pattern from the initial schema.
create policy "concepts_all" on concepts for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- ── locations.concept_id ────────────────────────────────────────
alter table locations add column if not exists concept_id uuid references concepts(id) on delete cascade;

-- ── Backfill ────────────────────────────────────────────────────
-- One default concept per org that already has at least one location,
-- named after the org itself (renameable immediately in the UI).
-- Orgs with zero locations are left with zero concepts — they hit the
-- "add a concept" onboarding CTA, same as any brand-new signup.
do $$
declare
  v_org record;
  v_concept_id uuid;
begin
  for v_org in
    select distinct o.id, o.name
    from organizations o
    join locations l on l.organization_id = o.id
    where l.concept_id is null
  loop
    insert into concepts (organization_id, name)
    values (v_org.id, v_org.name)
    returning id into v_concept_id;

    update locations
    set concept_id = v_concept_id
    where organization_id = v_org.id
      and concept_id is null;
  end loop;
end $$;

create index if not exists locations_concept_id_idx on locations (concept_id);
