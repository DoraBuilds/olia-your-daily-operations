-- ============================================================
-- INFOHUB ACCESS CONTROL FOUNDATION
-- Adds InfoHub folders/documents plus row-level access helpers
-- so future sharing can be enforced by Supabase, not only UI.
-- ============================================================

do $$ begin
  create type infohub_access_scope as enum ('org', 'restricted');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type infohub_section as enum ('library', 'training');
exception
  when duplicate_object then null;
end $$;

create table if not exists infohub_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section infohub_section not null,
  parent_id uuid references infohub_folders(id) on delete cascade,
  name text not null,
  access_scope infohub_access_scope not null default 'org',
  allowed_team_member_ids uuid[] not null default '{}'::uuid[],
  allowed_roles text[] not null default '{}'::text[],
  allowed_location_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists infohub_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section infohub_section not null,
  folder_id uuid not null references infohub_folders(id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  access_scope infohub_access_scope not null default 'org',
  allowed_team_member_ids uuid[] not null default '{}'::uuid[],
  allowed_roles text[] not null default '{}'::text[],
  allowed_location_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists infohub_folders_org_section_idx
  on infohub_folders (organization_id, section);

create index if not exists infohub_documents_org_section_idx
  on infohub_documents (organization_id, section);

create index if not exists infohub_documents_folder_idx
  on infohub_documents (folder_id);

drop trigger if exists infohub_folders_updated_at on infohub_folders;
create trigger infohub_folders_updated_at
  before update on infohub_folders
  for each row execute function update_updated_at();

drop trigger if exists infohub_documents_updated_at on infohub_documents;
create trigger infohub_documents_updated_at
  before update on infohub_documents
  for each row execute function update_updated_at();

alter table infohub_folders enable row level security;
alter table infohub_documents enable row level security;

create or replace function infohub_can_manage_content(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from team_members tm
    where tm.id = auth.uid()
      and tm.organization_id = p_org_id
      and (
        tm.role = 'Owner'
        or coalesce((tm.permissions->>'create_edit_checklists')::boolean, false)
        or coalesce((tm.permissions->>'manage_staff_profiles')::boolean, false)
      )
  );
$$;

create or replace function infohub_scope_allows(
  p_org_id uuid,
  p_access_scope infohub_access_scope,
  p_allowed_team_member_ids uuid[],
  p_allowed_roles text[],
  p_allowed_location_ids uuid[]
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_org_id = current_org_id()
    and (
      p_access_scope = 'org'
      or exists (
        select 1
        from team_members tm
        where tm.id = auth.uid()
          and tm.organization_id = p_org_id
          and (
            tm.role = 'Owner'
            or tm.id = any(coalesce(p_allowed_team_member_ids, '{}'::uuid[]))
            or tm.role = any(coalesce(p_allowed_roles, '{}'::text[]))
            or coalesce(tm.location_ids && coalesce(p_allowed_location_ids, '{}'::uuid[]), false)
          )
      )
    );
$$;

create or replace function infohub_can_access_folder(p_folder_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with recursive folder_tree as (
    select
      f.id,
      f.organization_id,
      f.parent_id,
      f.access_scope,
      f.allowed_team_member_ids,
      f.allowed_roles,
      f.allowed_location_ids
    from infohub_folders f
    where f.id = p_folder_id

    union all

    select
      parent.id,
      parent.organization_id,
      parent.parent_id,
      parent.access_scope,
      parent.allowed_team_member_ids,
      parent.allowed_roles,
      parent.allowed_location_ids
    from infohub_folders parent
    join folder_tree child on child.parent_id = parent.id
  )
  select
    coalesce(
      bool_and(
        infohub_scope_allows(
          organization_id,
          access_scope,
          allowed_team_member_ids,
          allowed_roles,
          allowed_location_ids
        )
      ),
      false
    )
  from folder_tree;
$$;

create or replace function infohub_can_access_document(p_document_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1
      from infohub_documents d
      where d.id = p_document_id
        and infohub_scope_allows(
          d.organization_id,
          d.access_scope,
          d.allowed_team_member_ids,
          d.allowed_roles,
          d.allowed_location_ids
        )
        and infohub_can_access_folder(d.folder_id)
    );
$$;

drop policy if exists infohub_folders_select on infohub_folders;
create policy infohub_folders_select on infohub_folders for select
  using (infohub_can_access_folder(id));

drop policy if exists infohub_folders_insert on infohub_folders;
create policy infohub_folders_insert on infohub_folders for insert
  with check (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
  );

drop policy if exists infohub_folders_update on infohub_folders;
create policy infohub_folders_update on infohub_folders for update
  using (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
  )
  with check (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
  );

drop policy if exists infohub_folders_delete on infohub_folders;
create policy infohub_folders_delete on infohub_folders for delete
  using (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
  );

drop policy if exists infohub_documents_select on infohub_documents;
create policy infohub_documents_select on infohub_documents for select
  using (infohub_can_access_document(id));

drop policy if exists infohub_documents_insert on infohub_documents;
create policy infohub_documents_insert on infohub_documents for insert
  with check (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
    and infohub_can_access_folder(folder_id)
  );

drop policy if exists infohub_documents_update on infohub_documents;
create policy infohub_documents_update on infohub_documents for update
  using (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
    and infohub_can_access_folder(folder_id)
  )
  with check (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
    and infohub_can_access_folder(folder_id)
  );

drop policy if exists infohub_documents_delete on infohub_documents;
create policy infohub_documents_delete on infohub_documents for delete
  using (
    organization_id = current_org_id()
    and infohub_can_manage_content(organization_id)
  );
