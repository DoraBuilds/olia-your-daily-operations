-- Store departments as JSONB on the organization so changes survive navigation.
-- NULL means "use app defaults" (backwards-compatible with existing orgs).
alter table organizations add column if not exists departments jsonb;
