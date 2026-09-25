-- ================================================================
-- Rename a kiosk (#897). Owner-only, like create/regenerate (#861):
-- the Devices tab's 3-dot menu lets the owner change a kiosk's name.
-- ================================================================

create or replace function public.rename_kiosk_device(
  p_device_id uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _label text;
begin
  if not public._caller_is_org_owner() then
    raise exception 'rename_kiosk_device: only the account owner can manage kiosks.';
  end if;

  _label := nullif(trim(coalesce(p_label, '')), '');
  if _label is null then
    raise exception 'rename_kiosk_device: name is required.';
  end if;
  if length(_label) > 60 then
    raise exception 'rename_kiosk_device: label exceeds 60 characters.';
  end if;

  update public.kiosk_devices
  set label = _label
  where id = p_device_id
    and organization_id = public.current_org_id()
    and revoked_at is null;

  if not found then
    raise exception 'rename_kiosk_device: device % not found.', p_device_id;
  end if;
end;
$$;

revoke all on function public.rename_kiosk_device(uuid, text) from public, anon;
grant execute on function public.rename_kiosk_device(uuid, text) to authenticated;
