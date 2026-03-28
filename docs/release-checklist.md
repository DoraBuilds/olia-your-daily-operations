# Release Checklist

Use this checklist before any production or pilot release candidate.

## 1. Environment And Secrets

- Confirm the intended Supabase project is linked and `bun run supabase:parity` reports no missing remote migrations.
- Confirm hosted email config with `bun run resend:audit --require-sender`.
- Confirm Stripe price IDs and portal URL are set in the target deployment environment.
- Confirm `VITE_PUBLIC_SITE_URL` matches the deployed origin and Supabase Auth redirect settings.

## 2. Local Verification Gate

- Run `bun run lint`.
- Run `bun run test:ci`.
- Run `bun run build`.
- Run `bun run test:integration` when Supabase or kiosk auth paths changed.

## 3. Mobile Release Gate

- Build and sync the native shell with `bun run cap:ios` or `bun run cap:android`.
- Run the Maestro smoke flows from [docs/e2e-release-gate.md](/Users/doraangelov/Desktop/OLIA%20✨/olia-your-daily-operations-main/docs/e2e-release-gate.md).
- Record any skipped flow and why it was skipped.

## 4. Manual Product Verification

- Auth: signup, auth callback, and login entry points behave correctly in the target environment.
- Kiosk: location launch, PIN entry, checklist completion, optional-question progression, photo capture, and completion logging.
- Dashboard: alerts section visible, alerts page reachable, daily compliance sorting and drill-through.
- Checklists: builder, reporting filters, PDF export, and multi-location assignment.
- Infohub and Training: document access, AI tools, and persisted training progress where relevant.
- Admin: location creation, map-backed address selection, opening hours, staff/team member setup, PIN updates, and billing access.

## 5. Rollout And Recovery

- Capture the exact git SHA and Supabase migration state used for the release candidate.
- Keep a rollback target for the previous production build and previous verified Supabase schema state.
- After release, verify auth, kiosk launch, alert email delivery, and billing entry points on the live environment.
