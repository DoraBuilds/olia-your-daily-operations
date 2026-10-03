# Waitlist mode: what's switched on, and how to open signups

While the waitlist is on, nobody can create a new Olia company. Existing users
still log in, invited team members still join, kiosks still pair.

## What is closed, and where

| Layer | What it does while closed | Switch |
|---|---|---|
| Front end | Landing CTAs open the waitlist modal; `/signup` redirects to `/`; the login page has no "create account" link | build-time `VITE_WAITLIST_MODE` (default on; `false` turns it off) |
| Database | `setup_new_organization` raises `Signups are not open yet` for anyone without an existing team member, so a direct API call can't create a company | `app_config` key `signups_enabled` (default `'false'`) |
| Login | `/login` uses `shouldCreateUser: false`, so an unknown email never creates an account | always on (not a toggle) |
| Supabase Auth | **Leave "Allow new users to sign up" ON** (see below) | dashboard, don't change |

### Why the Supabase dashboard sign-up setting stays on

New invitees have no auth account yet. `/accept-invite` creates it by sending
them a one-time code with `shouldCreateUser: true`. If you turn off
**Authentication → Sign In / Providers → Allow new users to sign up**, brand-new
invited people can no longer get a code and invites break. The database gate
above is the real protection: a stray auth account (someone calling Supabase
directly with an unknown email) has no team member row and cannot create or see
any company.

Known leftover: such a direct call can still create an empty auth user and send
that address a login email. Supabase rate-limits it, and the empty user can do
nothing, but it is not zero. Fixing it fully means changing the invite flow to
create invitee accounts server-side; say so if you want that.

## To open signups (all three, in this order)

1. Database: run in the Supabase SQL Editor
   ```sql
   UPDATE public.app_config SET value = 'true' WHERE key = 'signups_enabled';
   ```
2. Front end: build/deploy with `VITE_WAITLIST_MODE=false` (CI/Pages env var or
   `.env.production`), which restores the Sign in / Get started CTAs and `/signup`.
3. Dashboard: nothing to change. Leave "Allow new users to sign up" on.

To close again: set `signups_enabled` back to `'false'` and rebuild without
`VITE_WAITLIST_MODE=false`.

Doing only step 2 leaves the buttons back but every new signup still fails with
"Signups are not open yet". Doing only step 1 opens the API but nobody sees a
sign-up button.

## Waitlist notifications

See `docs/waitlist-sheet-setup.md` (Google Sheet row + email per signup).
