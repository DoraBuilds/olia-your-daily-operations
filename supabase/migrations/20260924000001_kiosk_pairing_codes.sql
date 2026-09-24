-- ================================================================
-- Kiosk pairing codes (#861).
--
-- Until now a kiosk was set up on the tablet itself: an owner signed in
-- on the device and tapped "Run kiosk" (or opened an "Activate kiosk"
-- link), and the device registered itself via register_kiosk_device —
-- which was callable by anon for any location id. The owner's session was
-- then left signed in on the tablet so the in-kiosk Admin PIN could reach
-- /admin.
--
-- New model:
--   1. An owner creates a kiosk for a location from Admin
--      (create_kiosk_device). It gets a one-time pairing code.
--   2. On the tablet, Login -> "Kiosk" tab -> enter the code
--      (pair_kiosk_device, anon). The code is consumed, the tablet gets
--      the device token and goes straight into kiosk mode. Nobody signs
--      in on the tablet.
--   3. "New code" (regenerate_kiosk_pairing_code) issues a fresh code AND
--      rotates the device token, so whatever tablet was paired before is
--      disconnected on its next heartbeat.
--   4. The in-kiosk Admin PIN goes through the kiosk-admin-login edge
--      function, which calls kiosk_admin_pin_login (service_role only):
--      device must be paired + active, PIN must be an owner's admin PIN
--      (validate_admin_pin, with its existing per-location rate limit).
--      The function then mints a short session for that owner.
-- ================================================================

alter table kiosk_devices add column if not exists pairing_code text;
alter table kiosk_devices add column if not exists paired_at timestamptz;

-- Every device that exists today was registered by a tablet that was
-- already running as a kiosk, so it's paired.
update kiosk_devices
set paired_at = coalesce(last_seen_at, created_at)
where paired_at is null;

create unique index if not exists kiosk_devices_pairing_code_idx
  on kiosk_devices (pairing_code)
  where pairing_code is not null;

-- ── helpers ─────────────────────────────────────────────────────
-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
-- Stored without the dash; the UI shows it as XXXX-XXXX.
create or replace function public._generate_kiosk_pairing_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  _alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _bytes bytea;
  _code text;
  i int;
begin
  loop
    _bytes := extensions.gen_random_bytes(8);
    _code := '';
    for i in 0..7 loop
      _code := _code || substr(_alphabet, 1 + (get_byte(_bytes, i) % length(_alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.kiosk_devices where pairing_code = _code);
  end loop;
  return _code;
end;
$$;

revoke all on function public._generate_kiosk_pairing_code() from public, anon, authenticated;

-- Owner of the caller's current org (is_owner flag, 20260915000003).
create or replace function public._caller_is_org_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where (tm.id = auth.uid() or tm.auth_user_id = auth.uid())
      and tm.organization_id = public.current_org_id()
      and tm.is_owner
  );
$$;

revoke all on function public._caller_is_org_owner() from public, anon;
grant execute on function public._caller_is_org_owner() to authenticated;

-- ── create_kiosk_device ─────────────────────────────────────────
create or replace function public.create_kiosk_device(
  p_location_id uuid,
  p_label text
)
returns table (device_id uuid, label text, pairing_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id uuid;
  _label text;
begin
  if not public._caller_is_org_owner() then
    raise exception 'create_kiosk_device: only the account owner can add kiosks.';
  end if;

  select organization_id into _org_id
  from public.locations
  where id = p_location_id and organization_id = public.current_org_id();
  if _org_id is null then
    raise exception 'create_kiosk_device: location % not found.', p_location_id;
  end if;

  _label := nullif(trim(coalesce(p_label, '')), '');
  if _label is not null and length(_label) > 60 then
    raise exception 'create_kiosk_device: label exceeds 60 characters.';
  end if;

  return query
    insert into public.kiosk_devices (organization_id, location_id, label, pairing_code)
    values (_org_id, p_location_id, coalesce(_label, 'Kiosk'), public._generate_kiosk_pairing_code())
    returning kiosk_devices.id, kiosk_devices.label, kiosk_devices.pairing_code;
end;
$$;

revoke all on function public.create_kiosk_device(uuid, text) from public, anon;
grant execute on function public.create_kiosk_device(uuid, text) to authenticated;

-- ── regenerate_kiosk_pairing_code ───────────────────────────────
-- Rotating device_token is what disconnects the previously paired tablet:
-- touch_kiosk_device (below) now returns false for an unknown token.
create or replace function public.regenerate_kiosk_pairing_code(
  p_device_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _code text;
begin
  if not public._caller_is_org_owner() then
    raise exception 'regenerate_kiosk_pairing_code: only the account owner can manage kiosks.';
  end if;

  update public.kiosk_devices
  set pairing_code = public._generate_kiosk_pairing_code(),
      paired_at = null,
      last_seen_at = null,
      device_token = gen_random_uuid()
  where id = p_device_id
    and organization_id = public.current_org_id()
    and revoked_at is null
  returning pairing_code into _code;

  if _code is null then
    raise exception 'regenerate_kiosk_pairing_code: device % not found.', p_device_id;
  end if;

  return _code;
end;
$$;

revoke all on function public.regenerate_kiosk_pairing_code(uuid) from public, anon;
grant execute on function public.regenerate_kiosk_pairing_code(uuid) to authenticated;

-- ── pair_kiosk_device ───────────────────────────────────────────
-- Called by the tablet (anon) from Login -> Kiosk. Accepts the code with
-- or without the dash / in any case. Single use: only an unpaired,
-- non-revoked device matches.
create or replace function public.pair_kiosk_device(
  p_code text
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
  _code text;
  _device public.kiosk_devices%rowtype;
begin
  _code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(_code) <> 8 then
    return;
  end if;

  update public.kiosk_devices d
  set paired_at = now(),
      last_seen_at = now()
  where d.pairing_code = _code
    and d.paired_at is null
    and d.revoked_at is null
  returning d.* into _device;

  if _device.id is null then
    return;
  end if;

  return query
    select _device.id, _device.device_token, _device.label,
           l.id, l.name, l.kiosk_token::text
    from public.locations l
    where l.id = _device.location_id;
end;
$$;

revoke all on function public.pair_kiosk_device(text) from public;
grant execute on function public.pair_kiosk_device(text) to anon, authenticated;

-- ── touch_kiosk_device ──────────────────────────────────────────
-- Unknown token now means "not a kiosk any more": its code was
-- regenerated (token rotated) or its location was deleted (cascade).
-- Devices that never had a token don't call this at all (see
-- touchKioskDevice in src/lib/kiosk-guard.ts).
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
    and paired_at is not null
  returning revoked_at into _revoked_at;

  if not found then
    return false;
  end if;

  return _revoked_at is null;
end;
$$;

-- ── register_kiosk_device (removed) ─────────────────────────────
-- Devices are only created by an owner now (create_kiosk_device).
drop function if exists public.register_kiosk_device(uuid, text);

-- ── kiosk_admin_pin_login ───────────────────────────────────────
-- service_role only: called by the kiosk-admin-login edge function, which
-- turns the returned auth user into a session. Raises on an inactive
-- device; returns no row on a wrong PIN. validate_admin_pin records the
-- attempt and enforces its 10-failures-per-5-minutes lock per location.
create or replace function public.kiosk_admin_pin_login(
  p_device_token uuid,
  p_pin text
)
returns table (
  team_member_id uuid,
  auth_user_id uuid,
  email text,
  location_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _location_id uuid;
  _member_id uuid;
begin
  select d.location_id into _location_id
  from public.kiosk_devices d
  where d.device_token = p_device_token
    and d.paired_at is not null
    and d.revoked_at is null;

  if _location_id is null then
    raise exception 'kiosk_device_inactive';
  end if;

  select v.id into _member_id
  from public.validate_admin_pin(p_pin, _location_id) v
  limit 1;

  if _member_id is null then
    return;
  end if;

  return query
    select tm.id, u.id, u.email::text, _location_id
    from public.team_members tm
    join auth.users u on u.id = coalesce(tm.auth_user_id, tm.id)
    where tm.id = _member_id;
end;
$$;

revoke all on function public.kiosk_admin_pin_login(uuid, text) from public, anon, authenticated;
grant execute on function public.kiosk_admin_pin_login(uuid, text) to service_role;
