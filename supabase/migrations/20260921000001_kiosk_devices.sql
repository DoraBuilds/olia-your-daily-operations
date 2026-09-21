-- ================================================================
-- Kiosk device fleet management (#818).
--
-- Kiosk pinning has always been per-browser (kiosk_location_id +
-- kiosk_token in localStorage, see 20260429000006_kiosk_setup_token.sql)
-- — nothing has ever stopped two different tablets from being kiosk
-- devices for two different locations at the same time. What's been
-- missing, now that a company can have several concepts each with
-- several locations, is any server-side record of which devices exist —
-- an owner has no way to see what's running across their locations, or
-- to remotely deactivate a lost/stolen tablet without physically finding
-- it and tapping "Exit kiosk mode" on the device itself.
--
-- This adds a lightweight device registry, independent of the existing
-- locations.kiosk_token anti-tamper check (SEQ-009), which is left
-- untouched. Each device is issued its own device_token at setup time,
-- so deactivating one device never affects any other device pinned to
-- the same location.
-- ================================================================

create table if not exists kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  label text not null default 'Kiosk',
  device_token uuid not null default gen_random_uuid(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table kiosk_devices enable row level security;

create unique index if not exists kiosk_devices_device_token_idx on kiosk_devices (device_token);
create index if not exists kiosk_devices_location_id_idx on kiosk_devices (location_id);
create index if not exists kiosk_devices_organization_id_idx on kiosk_devices (organization_id);

-- Owners/managers can see and manage devices within their own org.
-- Mirrors the "concepts_all" pattern (20260915000001_concepts.sql) — no
-- separate anon policy, since anon (the kiosk itself) only ever touches
-- this table through the SECURITY DEFINER RPCs below, never directly.
create policy "kiosk_devices_all" on kiosk_devices for all
  using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

-- ── register_kiosk_device ───────────────────────────────────────
-- Called once, the first time a device resolves a location (kiosk launch
-- from Admin, or a relaunch to a different location) — see
-- ensureKioskDevice() in src/pages/kiosk/PinEntryModal.tsx, which no-ops
-- once kiosk_device_token is already stored. Creates a new device row
-- scoped to that location and returns its id + a freshly generated
-- token, which the client stores in localStorage alongside the existing
-- kiosk_location_id/kiosk_token.
create or replace function public.register_kiosk_device(
  p_location_id uuid,
  p_label text
)
returns table (device_id uuid, device_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id uuid;
  _label text;
begin
  select organization_id into _org_id from public.locations where id = p_location_id;
  if _org_id is null then
    raise exception 'register_kiosk_device: location % not found.', p_location_id;
  end if;

  _label := nullif(trim(coalesce(p_label, '')), '');
  if _label is not null and length(_label) > 60 then
    raise exception 'register_kiosk_device: label exceeds 60 characters.';
  end if;

  return query
    insert into public.kiosk_devices (organization_id, location_id, label)
    values (_org_id, p_location_id, coalesce(_label, 'Kiosk'))
    returning kiosk_devices.id, kiosk_devices.device_token;
end;
$$;

-- Called from Kiosk.tsx, which may be running signed-in (the owner/manager
-- who just tapped "Launch Kiosk" and is still on the device) or, for the
-- lazy-backfill path, signed out on the anon key — a device that already
-- has kiosk_location_id/kiosk_token but predates this migration.
grant execute on function public.register_kiosk_device(uuid, text) to anon, authenticated;

-- ── touch_kiosk_device ───────────────────────────────────────────
-- Called periodically by the kiosk itself (anon key, no login) to record
-- a heartbeat and find out whether it's still allowed to run. Returns
-- false only when the device was deactivated from Admin -> Kiosks — the
-- client then wipes its local kiosk config and falls back to the
-- unconfigured/setup state.
create or replace function public.touch_kiosk_device(
  p_device_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _revoked_at timestamptz;
begin
  update public.kiosk_devices
  set last_seen_at = now()
  where device_token = p_device_token
  returning revoked_at into _revoked_at;

  if not found then
    -- Unknown token — nothing to revoke, so don't lock the kiosk out.
    return true;
  end if;

  return _revoked_at is null;
end;
$$;

grant execute on function public.touch_kiosk_device(uuid) to anon, authenticated;

-- ── revoke_kiosk_device ───────────────────────────────────────────
-- Called from the Admin -> Kiosks fleet view to remotely deactivate one
-- device. Terminal — there's no un-revoke; re-launching the kiosk from
-- Admin registers a fresh device row.
create or replace function public.revoke_kiosk_device(
  p_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.kiosk_devices
  set revoked_at = now()
  where id = p_device_id
    and organization_id = current_org_id();

  if not found then
    raise exception 'revoke_kiosk_device: device % not found in the caller''s organization.', p_device_id;
  end if;
end;
$$;

grant execute on function public.revoke_kiosk_device(uuid) to authenticated;
