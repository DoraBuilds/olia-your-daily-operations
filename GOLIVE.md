# Olia — Go-Live Checklist

Items that must be completed before launching to real customers.

---

## ✅ Done

- Email alert pipeline (Resend + pg_net + DB trigger) — fully working
- Checklist logic rule "Notify" triggers — working end-to-end
- Resend sending domain — `oliahq.com` verified
- Stripe billing UI — connected to live Stripe account
- Google Maps address autocomplete + map preview — working
- Test suite — all 5 pre-existing failures fixed (4× Kiosk numpad, 1× Admin LocationModal)
- Error monitoring — Sentry active, DSN set in GitHub Actions, deployed
- Infohub — `infohub_folders` + `infohub_documents` Supabase tables + RLS + React Query hooks — fully working
- Team member invitations — edge function (`invite-team-member`) sends email via Resend, `team_member_invites` table + `validate_invite_token()` + `accept_invite()` RPCs in migration, `AcceptInvite.tsx` OTP flow, pending invite badge + resend button in AccountTab, `/accept-invite` route registered
- GDPR account deletion — `delete_my_account()` RPC in migration, Delete Account button with "type DELETE to confirm" modal in AccountTab, `?reason=account-deleted` banner on Signup
- "Build with AI" / "Convert File" — `generate-checklist`, `generate-training`, `infohub-ai-tools` all deployed, `ANTHROPIC_API_KEY` set, error states in place
- Google Maps — API key set in GitHub, working in production

---

## 🔲 Pending — config steps only (no code to write)

### 1. Set Supabase edge function secrets
Go to Supabase → Settings → Edge Functions → Secrets and set:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (enables "Build with AI" and "Convert File") |
| `INVITE_FROM_EMAIL` | `invites@oliahq.com` (or any verified sender on oliahq.com — prevents fallback to Resend dev default) |

---

### 2. Stripe — switch from sandbox to production
Stripe has two separate environments. You need to swap 7 values — 5 in GitHub and 2 in Supabase.
(`VITE_STRIPE_PUBLISHABLE_KEY` is NOT needed — checkout is server-side via edge function; the frontend never loads Stripe.js.)

#### Step 1 — Get your live keys from Stripe
1. Go to dashboard.stripe.com
2. Toggle from **Test mode** to **Live mode** (top-right switch)
3. Go to **Developers → API Keys** → copy:
   - `Secret key` (starts with `sk_live_`)

#### Step 2 — Create live products and prices
1. In Stripe (Live mode) → **Product catalogue → Add product**
2. Create your plans (e.g. Growth Monthly, Growth Annual) — copy each `price_...` ID
3. Go to **Settings → Billing → Customer portal** → Activate it → copy the portal URL

#### Step 3 — Update GitHub Variables
Go to github.com → DoraBuilds/olia-your-daily-operations → Settings → Variables → Actions
Update these 5 variables with your live values:

| Variable name | Value |
|---|---|
| `VITE_STRIPE_PRICE_STARTER_MONTHLY` | `price_...` (live) |
| `VITE_STRIPE_PRICE_STARTER_ANNUAL` | `price_...` (live) |
| `VITE_STRIPE_PRICE_GROWTH_MONTHLY` | `price_...` (live) |
| `VITE_STRIPE_PRICE_GROWTH_ANNUAL` | `price_...` (live) |
| `VITE_STRIPE_CUSTOMER_PORTAL_URL` | `https://billing.stripe.com/p/login/...` |

#### Step 4 — Update Supabase Secrets
Go to Supabase → Settings → Edge Functions → Secrets
Update these 2 secrets:

| Secret name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | new live webhook secret (see Step 5) |

#### Step 5 — Set up live webhook
1. In Stripe (Live mode) → **Developers → Webhooks → Add endpoint**
2. URL: `https://xdhejmnjhjlgcboawmnu.supabase.co/functions/v1/stripe-webhook`
3. Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** (starts with `whsec_`) → paste as `STRIPE_WEBHOOK_SECRET` in Supabase

#### Step 6 — Redeploy
After updating all secrets/variables, push any small change to trigger a rebuild, or manually re-run the GitHub Actions deployment.

---

### 3. Google Maps API key
Address autocomplete won't work without a live key.

1. Go to console.cloud.google.com → create a project → enable "Places API"
2. Create an API key → restrict it to your domain (`oliahq.com`)
3. Go to GitHub → Settings → Secrets → Actions
4. Add secret: `VITE_GOOGLE_MAPS_API_KEY` = your key
5. Re-run the latest GitHub Actions deployment (or push any small commit)

---

### 4. Sentry DSN
Error monitoring is wired in but inactive until the DSN is set.

1. Go to sentry.io → create a project (React) → copy the DSN
2. Go to GitHub → Settings → Variables → Actions
3. Add variable: `VITE_SENTRY_DSN` = your DSN
4. Re-run the latest GitHub Actions deployment

---

### 5. Google Maps — migrate to new Places API (non-urgent)
**Why:** Google deprecated `AutocompleteService` for new customers from March 2025.
It still works and will continue to work with at least 12 months notice before removal.
**What to do:** Migrate `PlacesAutocompleteInput.tsx` to use `google.maps.places.AutocompleteSuggestion` per the [migration guide](https://developers.google.com/maps/documentation/javascript/places-migration-overview).
