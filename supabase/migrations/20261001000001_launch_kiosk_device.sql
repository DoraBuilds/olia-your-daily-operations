-- ================================================================
-- Launch a kiosk from Admin -> Devices (3-dot menu "Open kiosk here").
--
-- Pairing normally happens on the tablet with the one-time code. An owner
-- who is already signed in can instead turn the CURRENT browser into that
-- kiosk. This returns the same identity pair_kiosk_device does, without
-- needing the code, and without rotating device_token — so a tablet that
-- is already paired to this device keeps working.
--
-- If the device was still waiting for a tablet, launching it here counts
-- as pairing it (paired_at set), so its code stops working.
-- ================================================================

create or replace function public.launch_kiosk_device(
  p_device_id uuid
)
returns table (
  device_id uuid,
  device_token uuid,
  device_label text,
  location_id uuid,
  location_name text,
  kiosk_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _device public.kiosk_devices%rowtype;
begin
  if not public._caller_is_org_owner() then
    raise exception 'launch_kiosk_device: only the account owner can launch kiosks.';
  end if;

  update public.kiosk_devices d
  set paired_at = coalesce(d.paired_at, now()),
      last_seen_at = now()
  where d.id = p_device_id
    and d.organization_id = public.current_org_id()
    and d.revoked_at is null
  returning d.* into _device;

  if _device.id is null then
    raise exception 'launch_kiosk_device: device % not found.', p_device_id;
  end if;

  return query
    select _device.id, _device.device_token, _device.label,
           l.id, l.name, l.kiosk_token::text
    from public.locations l
    where l.id = _device.location_id;
end;
$$;

revoke all on function public.launch_kiosk_device(uuid) from public, anon;
grant execute on function public.launch_kiosk_device(uuid) to authenticated;
