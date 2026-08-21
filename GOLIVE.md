# Olia — Go-Live Checklist

---

## ✅ Done

- Email alert pipeline (Resend + pg_net + DB trigger) — fully working
- Checklist logic rule "Notify" triggers — working end-to-end
- Resend sending domain — `oliahq.com` verified
- Stripe billing UI — connected to live Stripe account
- Google Maps address autocomplete + map preview — working
- Test suite — all pre-existing failures fixed
- Error monitoring — Sentry active, DSN deployed, consent-gated
- Infohub — tables, RLS, React Query hooks — fully working
- Team member invitations — edge function, DB table, OTP accept flow, pending badge, resend button
- GDPR account deletion — RPC, confirmation modal, post-deletion redirect
- "Build with AI" / "Convert File" / Training AI — all three edge functions deployed, `ANTHROPIC_API_KEY` set
- Google Maps — API key set, working in production
- Cookie consent banner — AEPD-compliant equal-weight buttons, consent-gates Sentry
- Privacy Policy (`/privacy`) — GDPR + LOPDGDD + AEPD, Spain-specific
- Terms of Service (`/terms`) — Spanish law, Barcelona courts, IVA section
- Cookie Policy (`/cookies`) — full per-cookie table, AEPD-compliant
- Aviso Legal (`/aviso-legal`) — LSSI Article 10, written in Spanish *(company details pending — see below)*
- PostHog analytics — consent-gated (same pattern as Sentry), live, verified firing on oliahq.com
- `sitemap.xml` — added and linked from `robots.txt` (was 404)
- Landing page "Contact sales" — now opens the demo-request modal instead of a dead link
- AI-content disclosure — "AI-generated draft, review before saving" note on Build with AI / Convert File / AI training; Privacy Policy updated with Anthropic as a processor
- UI audit fixes — Kiosk skeleton loader (was a spinner), 3 raw-color spots switched to semantic tokens, aria-labels added to ~29 icon-only buttons

---

## 🔲 Two things left before launch

### 1. Aviso Legal — company details

The legal text is written. Three fields need your company info:

| Field | What to provide |
|---|---|
| Razón social | Your company's legal name (e.g. "Olia Technologies S.L.") |
| CIF | Your Spanish tax ID (e.g. B12345678) |
| Domicilio social | Your registered address in Barcelona |
| Registro Mercantil | Volume, folio, and hoja from your company registration *(only if you have an S.L. or S.A.)* |

**When you have these:** send them to me and I'll fill them in and deploy.

---

### 2. Stripe — switch from test to live

The billing flow works end-to-end but is still using test Stripe credentials. When you and your co-founder are ready:

**What I need from you** (paste these values to me and I'll set everything):

| What | Where to find it |
|---|---|
| Live secret key (`sk_live_...`) | Stripe dashboard → Live mode → Developers → API Keys |
| 4 live price IDs (`price_...`) | Stripe → Live mode → Product catalogue (one per plan: Starter Monthly/Annual, Growth Monthly/Annual) |
| Live customer portal URL | Stripe → Live mode → Settings → Billing → Customer portal |
| Live webhook signing secret (`whsec_...`) | Stripe → Live mode → Developers → Webhooks → create endpoint pointing to `https://xdhejmnjhjlgcboawmnu.supabase.co/functions/v1/stripe-webhook`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

**When you have these:** paste them to me and I'll set all 7 values (5 GitHub, 2 Supabase) and trigger a redeploy.

---

## Non-urgent (post-launch)

- Google Maps API migration — deprecated `AutocompleteService` still works, Google gives 12+ months notice before removal. Migrate `PlacesAutocompleteInput.tsx` to `AutocompleteSuggestion` when ready.

### Session token hardening (from the 2026-08-21 security review)

The Supabase session (access + refresh token) currently lives in `localStorage`, readable by any JS on the page — standard supabase-js default, not unique to Olia, but worth closing given no CSP exists yet either. Fixing this properly requires standing up a small first-party auth proxy (Olia is a static SPA today with no backend), so it's tracked as its own milestone rather than a quick patch:

**[Milestone: Session token hardening (httpOnly cookie migration)](https://github.com/DoraBuilds/olia-your-daily-operations/milestone/13)** — 6 issues, chunked so the backend/edge platform choice (#656) is a separate, deliberately-deferred decision from the implementation work (#654, #657, #658, #659, #660). Also fixed as part of the same review: a `team_members` RLS gap letting any team member edit/promote any other member's role (#647, already shipped) and an Owner-only check missing from the invite-team-member function (also #647, already shipped).

### From the landing-page audit (2026-08-21)

- **Real customer quote / case study** — replace the generic trust badges ("Live in many kitchens" etc.) with one genuine quote or before/after story from an actual venue. Blocked on you — needs real content, not something to fabricate.
- ~~FAQ section~~ — done. 5 questions added between Pricing and the final CTA.
- ~~Unique page titles + meta descriptions per route~~ — done, via `useDocumentMeta` hook on all public routes.
- ~~Re-skin the 404 page~~ — done, now uses the teal/black/white marketing theme.
- Skipped as not applicable to a SaaS product (no physical venue): maps + directions, LocalBusiness schema markup, response-time-promise SLA copy, breadcrumbs.
