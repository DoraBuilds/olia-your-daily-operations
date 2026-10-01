-- ================================================================
-- Testing a kiosk from Admin must NOT pair or connect anything.
--
-- launch_kiosk_device (20261001000001) handed the browser the device's
-- token and marked an unpaired device as paired, so merely trying a kiosk
-- turned the browser into it. Replaced by a read-only preview: it returns
-- only what the kiosk screen needs to display (location + label), never
-- the device_token, and changes nothing.
-- ================================================================

drop function if exists public.launch_kiosk_device(uuid);

create or replace function public.preview_kiosk_device(
  p_device_id uuid
)
returns table (
  device_label text,
  location_id uuid,
  location_name text,
  kiosk_token text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public._caller_is_org_owner() then
    raise exception 'preview_kiosk_device: only the account owner can test kiosks.';
  end if;

  return query
    select d.label, l.id, l.name, l.kiosk_token::text
    from public.kiosk_devices d
    join public.locations l on l.id = d.location_id
    where d.id = p_device_id
      and d.organization_id = public.current_org_id()
      and d.revoked_at is null;
end;
$$;

revoke all on function public.preview_kiosk_device(uuid) from public, anon;
grant execute on function public.preview_kiosk_device(uuid) to authenticated;
