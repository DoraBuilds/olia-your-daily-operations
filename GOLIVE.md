# Olia — Go-Live Checklist

Items that must be completed before launching to real customers.

---

## ✅ Done
- Email alert pipeline (Resend + pg_net + DB trigger) — fully working
- Checklist logic rule "Notify" triggers — working end-to-end
- Stripe billing UI — connected to live Stripe account
- Google Maps address autocomplete + map preview — working

---

## 🔲 Pending

### 1. Fix 5 pre-existing test failures
**Why:** Two test files have been broken since UI redesigns were made without updating the tests. Broken tests erode confidence in the suite and mask real regressions.

- **4× Kiosk — Admin Login Modal:** Tests look for `id="admin-pin-input"` and `id="admin-pin-signin-btn"` (old text-input + button UI). The modal was redesigned to a numpad; those IDs no longer exist.
- **1× Admin — LocationModal:** Test only fills in the location name, but the "Alert email" field was added as required later. `disabled={!name.trim() || !email.trim()}` keeps the save button disabled.

---

### 2. Infohub — replace mock data with Supabase
**Why:** All documents and training content is hardcoded `useState`. Nothing persists across refreshes, nothing is shared between team members. This is the most visible gap for a real user.

**What to build:**
1. Supabase tables: `infohub_folders`, `infohub_documents`, `infohub_training_modules`
2. RLS policies (org-scoped, same pattern as checklists)
3. React Query hooks: `useInfohubFolders`, `useInfohubDocuments`, `useTrainingModules`
4. Wire `Infohub.tsx` to use hooks instead of local state

---

### 3. Team member invitations — email delivery
**Why:** The "Invite team member" button in Admin exists, but there is no email sent. Invited managers receive no notification and cannot create their account.

**What to build:**
1. Supabase edge function: `invite-team-member` — sends a magic-link-style email via Resend
2. `team_member_invites` table to track pending invites
3. `/accept-invite?token=` route to handle click-through
4. UI: pending invite badge on the team member row

---

### 4. "Build with AI" and "Convert File" — verify edge functions
**Why:** Both buttons in the Checklist builder call Supabase edge functions. It is not confirmed whether those functions are deployed and returning correct responses.

**What to do:**
1. Test both buttons against the production Supabase project
2. If functions are not deployed, deploy from `supabase/functions/`
3. Add visible error states for when the functions fail (currently silent)

---

### 5. Error monitoring — Sentry
**Why:** Silent failures in production are invisible. If `setup_new_organization` breaks for a new user, or an edge function throws, there is currently no alert.

**What to build:**
1. `npm install @sentry/react`
2. `Sentry.init(...)` in `src/main.tsx` with a DSN from sentry.io
3. Wrap the app in `Sentry.ErrorBoundary`
4. Add Sentry DSN as a GitHub secret (`VITE_SENTRY_DSN`)

---

### 6. GDPR — account deletion
**Why:** Required before launching to customers in the EU. Users must be able to delete their account and all associated data.

**What to build:**
1. Supabase RPC `delete_my_account()` — SECURITY DEFINER, deletes all org data, team_members, auth.users row
2. "Delete account" button in Admin → Account tab with a confirmation modal
3. Post-deletion: sign out and redirect to `/signup` with a "Your account has been deleted" message

---

### 7. Verified sending domain for email alerts
**Why:** Resend's `onboarding@resend.dev` sender can only deliver to your own email address.
Staff members and other recipients will not receive alert emails until a real domain is verified.

**What to do:**
1. Register a domain (e.g. `yourolia.app`, `yourbusiness.com`)
2. Go to resend.com → Domains → Add Domain → follow DNS setup
3. Once verified, go to Supabase → Settings → Edge Functions → Secrets
4. Update `ALERT_FROM_EMAIL` to `alerts@yourdomain.com` (or similar)

---

### 8. Stripe — switch from sandbox to production
**Status:** In progress — see instructions below.

---

### 9. Google Maps — migrate to new Places API (non-urgent)
**Why:** Google deprecated `AutocompleteService` for new customers from March 2025.
It still works and will continue to work with at least 12 months notice before removal.
**What to do:** Migrate `PlacesAutocompleteInput.tsx` to use `google.maps.places.AutocompleteSuggestion` per the [migration guide](https://developers.google.com/maps/documentation/javascript/places-migration-overview).

---

### 10. Google Maps API key
**Why:** Address autocomplete in the location editor does not work without a live key.

**What to do:**
1. Go to console.cloud.google.com → create a project → enable "Places API"
2. Create an API key → restrict it to your domain
3. Go to GitHub → Settings → Secrets → Actions
4. Add secret: `VITE_GOOGLE_MAPS_API_KEY` = your key
5. Re-run the latest GitHub Actions deployment (push any small commit)

---

## Stripe: Sandbox → Production

Stripe has two separate environments. You need to swap 8 values — 6 in GitHub and 2 in Supabase.

### Step 1 — Get your live keys from Stripe
1. Go to dashboard.stripe.com
2. Toggle from **Test mode** to **Live mode** (top-right switch)
3. Go to **Developers → API Keys** → copy:
   - `Publishable key` (starts with `pk_live_`)
   - `Secret key` (starts with `sk_live_`)

### Step 2 — Create live products and prices
1. In Stripe (Live mode) → **Product catalogue → Add product**
2. Create your plans (e.g. Growth Monthly, Growth Annual) — copy each `price_...` ID
3. Go to **Settings → Billing → Customer portal** → Activate it → copy the portal URL

### Step 3 — Update GitHub Secrets
Go to github.com → DoraBuilds/olia-your-daily-operations → Settings → Secrets → Actions
Update these 6 secrets with your live values:

| Secret name | Value |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_STRIPE_PRICE_STARTER_MONTHLY` | `price_...` (live) |
| `VITE_STRIPE_PRICE_STARTER_ANNUAL` | `price_...` (live) |
| `VITE_STRIPE_PRICE_GROWTH_MONTHLY` | `price_...` (live) |
| `VITE_STRIPE_PRICE_GROWTH_ANNUAL` | `price_...` (live) |
| `VITE_STRIPE_CUSTOMER_PORTAL_URL` | `https://billing.stripe.com/p/login/...` |

### Step 4 — Update Supabase Secrets
Go to Supabase → Settings → Edge Functions → Secrets
Update these 2 secrets:

| Secret name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | new live webhook secret (see Step 5) |

### Step 5 — Set up live webhook
1. In Stripe (Live mode) → **Developers → Webhooks → Add endpoint**
2. URL: `https://xdhejmnjhjlgcboawmnu.supabase.co/functions/v1/stripe-webhook`
3. Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** (starts with `whsec_`) → paste as `STRIPE_WEBHOOK_SECRET` in Supabase

### Step 6 — Redeploy
After updating all secrets, push any small change to trigger a rebuild, or manually re-run the GitHub Actions deployment.
