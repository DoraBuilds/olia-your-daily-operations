-- Track when a team member (admin/manager) last opened the app.
-- Supabase's built-in last_sign_in_at only updates on full OTP re-authentication,
-- not on session restores or token refreshes, so it stays frozen after first login.
-- This column is updated by the client on every INITIAL_SESSION / SIGNED_IN event.
alter table public.team_members
  add column if not exists last_seen_at timestamptz;
