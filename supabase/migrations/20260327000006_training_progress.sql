-- Persist per-user training progress so completion survives refreshes.

create table if not exists training_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  completed_step_indices integer[] not null default '{}'::integer[],
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, module_id)
);

drop trigger if exists training_progress_updated_at on training_progress;
create trigger training_progress_updated_at
  before update on training_progress
  for each row execute function update_updated_at();

alter table training_progress enable row level security;

drop policy if exists training_progress_select on training_progress;
create policy training_progress_select on training_progress for select
  using (organization_id = current_org_id() and user_id = auth.uid());

drop policy if exists training_progress_insert on training_progress;
create policy training_progress_insert on training_progress for insert
  with check (organization_id = current_org_id() and user_id = auth.uid());

drop policy if exists training_progress_update on training_progress;
create policy training_progress_update on training_progress for update
  using (organization_id = current_org_id() and user_id = auth.uid())
  with check (organization_id = current_org_id() and user_id = auth.uid());

drop policy if exists training_progress_delete on training_progress;
create policy training_progress_delete on training_progress for delete
  using (organization_id = current_org_id() and user_id = auth.uid());
