alter table organizations
  add column if not exists location_grace_period_ends_at timestamptz,
  add column if not exists active_location_ids uuid[] not null default '{}';

create or replace function location_plan_limit(p_plan text)
returns integer as $$
begin
  return case
    when p_plan = 'enterprise' then -1
    when p_plan = 'growth' then 10
    else 1
  end;
end;
$$ language plpgsql immutable;

create or replace function location_is_plan_editable(p_location_id uuid)
returns boolean as $$
declare
  v_org_id uuid;
  v_plan text;
  v_grace_ends_at timestamptz;
  v_active_location_ids uuid[];
  v_limit integer;
  v_location_count integer;
  v_is_default_active boolean;
begin
  select l.organization_id, o.plan, o.location_grace_period_ends_at, o.active_location_ids
  into v_org_id, v_plan, v_grace_ends_at, v_active_location_ids
  from locations l
  join organizations o on o.id = l.organization_id
  where l.id = p_location_id;

  if v_org_id is null or v_org_id <> current_org_id() then
    return false;
  end if;

  v_limit := location_plan_limit(v_plan);
  if v_limit = -1 then
    return true;
  end if;

  select count(*) into v_location_count
  from locations
  where organization_id = v_org_id;

  if v_location_count <= v_limit then
    return true;
  end if;

  if v_grace_ends_at is not null and v_grace_ends_at > now() then
    return true;
  end if;

  if coalesce(array_length(v_active_location_ids, 1), 0) > 0 then
    return p_location_id = any(v_active_location_ids[1:v_limit]);
  end if;

  select exists (
    select 1
    from (
      select id
      from locations
      where organization_id = v_org_id
      order by created_at asc, name asc, id asc
      limit v_limit
    ) active_locations
    where active_locations.id = p_location_id
  ) into v_is_default_active;

  return v_is_default_active;
end;
$$ language plpgsql security definer stable;

drop policy if exists "locations_update" on locations;

create policy "locations_update" on locations for update
  using (
    organization_id = current_org_id()
    and location_is_plan_editable(id)
  );
