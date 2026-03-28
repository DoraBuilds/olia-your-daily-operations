# Olia

Olia is a mobile-first operations app for hospitality teams. The product combines kiosk checklists, dashboard monitoring, Infohub training and documents, admin controls, and mobile-friendly workflows on top of Supabase.

## Stack

- React 18 + TypeScript + Vite
- Bun for package management and scripts
- Supabase for auth, Postgres, and edge-function-backed features
- React Query for server state
- Tailwind CSS + shadcn/ui for UI
- Capacitor for iOS and Android shells
- Vitest + Testing Library for unit and integration tests
- Maestro for mobile end-to-end flows

## Local Development

Use Bun for all package and script commands.

```bash
bun install
bun run dev
```

If `bun` is not on your `PATH`, use `~/.bun/bin/bun`.

The dev server runs at [http://localhost:8080](http://localhost:8080).

### GitHub Pages

The production build is compatible with GitHub Pages static hosting.

- In GitHub Actions, Vite automatically uses the repository name as the base path when `GITHUB_REPOSITORY` is present.
- `public/404.html` captures deep links and passes the requested route to the app, and `src/main.tsx` restores that route on load so refreshes and bookmark URLs keep working.
- If you want to test a Pages-style build locally, set `VITE_BASE_PATH=/olia-your-daily-operations/` before `bun run build`.
- The repository now includes a GitHub Pages deploy workflow in [`.github/workflows/github-pages.yml`](.github/workflows/github-pages.yml). Enable GitHub Pages with the "GitHub Actions" source in repo settings so the workflow can publish `main`.

### Supabase Modes

This repo supports two safe Supabase setups:

- Hosted Supabase for staging and production, using your remote project values in `.env.local`
- Local Docker Supabase for development and testing, using `supabase start`

Local prerequisites:

- Docker Desktop or another Docker runtime
- Supabase CLI installed and available on your `PATH`

Local Supabase workflow:

```bash
supabase start
supabase status -o env
supabase db reset --local --no-seed
```

The local CLI config lives in [supabase/config.toml](supabase/config.toml). It keeps auth redirects on `http://localhost:8080` and disables the default seed path so local resets do not depend on a missing top-level `seed.sql`.

To stop the local Docker stack:

```bash
supabase stop
```

If you prefer repo scripts, the same workflow is exposed through `bun run supabase:start`, `bun run supabase:status`, `bun run supabase:reset`, and `bun run supabase:stop`.

To compare the repo migrations against the linked hosted Supabase project without changing any data, run:

```bash
bun run supabase:parity
```

This is a read-only check that reports which local migrations are not yet applied remotely, and whether the remote project has any migration IDs that do not exist in the repo.

To audit the hosted alert-email setup, run:

```bash
SUPABASE_PROJECT_REF=your-project-ref bun run resend:audit
```

This checks that the hosted `send-alert-email` function exists, is active, and that the core Resend alert secrets are present. Add `--require-sender` if you want the audit to fail when `ALERT_FROM_EMAIL` is still missing.
 
Docker-backed integration tests use the same local stack. Once Docker and the Supabase CLI are available, run:

```bash
bun run test:integration
```

That command starts the local Supabase stack if needed, reads the live local API and keys from `supabase status -o env`, and runs the dedicated integration lane against real local services.

For a minimal real-browser smoke lane against the same local stack, run:

```bash
bun run e2e:playwright:live
```

That lane keeps the existing mocked Playwright suite intact and adds a separate live kiosk smoke test against the actual local Docker Supabase environment.

After each live Playwright run, open the visual HTML report at:

```bash
playwright-report/live/index.html
```

For one-command profile switching, keep these local-only files on your machine:

- `.env.docker` for local Docker Supabase development
- `.env.prod` for local app development against hosted production-like services

The app still reads `.env.local`, and the helper commands below copy the chosen profile into that active file before startup.

To boot local Supabase and start the app, use:

```bash
bun run dev:local
```

To run the app locally against hosted services, use:

```bash
bun run dev:prod
```

## Integration Tests

Run the local-Docker-Supabase integration suite with:

```bash
bun run test:integration
```

That command starts local Supabase, resets the database to a deterministic state, seeds a kiosk PIN fixture plus a sample checklist, and runs the Supabase-backed integration tests in `src/test/integration/`.

The current integration coverage exercises:

- real `validate_staff_pin` RPC calls
- real `get_kiosk_checklists` RPC calls against seeded data
- real `checklist_logs` inserts through the local anon RLS policy

### GitHub Pages Auth

If you deploy the web app to GitHub Pages or another static host, set these public build-time values in your deployment environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_SITE_URL` for hosted auth redirects, such as `https://<owner>.github.io/<repo>`

The app uses `VITE_PUBLIC_SITE_URL` when building the Supabase email confirmation redirect for `/auth/callback`. If that variable is not set, local development falls back to the current browser origin.

In the hosted Supabase project settings, allow the Pages origin and callback URL you actually deploy:

- `https://<owner>.github.io/<repo>/`
- `https://<owner>.github.io/<repo>/auth/callback`

Keep server-side secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `ANTHROPIC_API_KEY` out of the frontend. Those belong in Supabase Edge Function secrets, not GitHub Pages build-time env vars.

The `ANTHROPIC_API_KEY` powers the AI checklist builder and the AI training module generator through Supabase Edge Functions.

### Resend Email Delivery

Operational alert emails are sent through the Supabase Edge Function in [`supabase/functions/send-alert-email/`](supabase/functions/send-alert-email/).

Today, only operational alert email is Resend-backed in this repo. Signup confirmation emails still come from Supabase Auth, and invite/passwordless email flows are not built yet.

The current delivery ownership and future email strategy are documented in [docs/email-delivery-foundation.md](docs/email-delivery-foundation.md).

Required configuration:

- `RESEND_API_KEY` in Supabase Edge Function secrets
- `ALERT_SECRET` in Supabase Edge Function secrets
- `ALERT_FROM_EMAIL` in Supabase Edge Function secrets, set to a verified sender in Resend
- `app.alert_secret` in the hosted database, set to the same shared secret value as `ALERT_SECRET`

If `ALERT_FROM_EMAIL` is not set, the function falls back to `onboarding@resend.dev` for development and early testing. Treat that as a temporary default, not a production sender strategy. The hosted audit command above treats a missing sender as a failure.

To audit the linked hosted project without changing anything, run:

```bash
bun run resend:audit
```

That command checks:

- the linked hosted project ref
- the `send-alert-email` function exists and is `ACTIVE`
- required secrets are present
- whether `ALERT_FROM_EMAIL` is configured

If you want the audit to fail when the verified sender is missing, run:

```bash
bun run resend:audit --require-sender
```

Suggested release-time verification flow:

1. Set `RESEND_API_KEY`, `ALERT_SECRET`, and `ALERT_FROM_EMAIL` in Supabase Edge Function secrets.
2. Ensure the hosted database has `app.alert_secret` set to the same value as `ALERT_SECRET`.
3. Run `bun run resend:audit --require-sender`.
4. Trigger a real alert in the hosted environment and confirm the email arrives from the branded sender, not the fallback address.

The broader email platform notes live in [docs/email-platform.md](docs/email-platform.md).

## Common Commands

```bash
bun run dev
bun run build
bun run lint
bun run test
bun run test:watch
bun run test:coverage
bun run test:ci
bun run test:integration
bun run milestone
bun run e2e
bun run resend:audit
bun run cap:ios
bun run cap:android
bun run e2e:playwright:live
supabase start
supabase stop
supabase status -o env
supabase db reset --local --no-seed
```

## Workflow

- Do not push or merge directly to `main`.
- Create a branch for every change.
- Open a pull request for all work, including small fixes.
- Treat `main` as protected even if local tooling would allow direct changes.
- Register every new task in GitHub before implementation starts.
- When creating a new GitHub task, add appropriate existing labels and assign the best-fit milestone when possible.
- Reuse an existing GitHub issue when the work is already tracked; create a new issue only for genuinely new work.

## Quality Gates

The intended milestone gate is:

1. `bun run lint`
2. `bun run test:ci`
3. `bun run build`
4. `bun run e2e` on a simulator or emulator

The current enforced unit-test thresholds live in `vitest.config.ts`. Treat that file as the source of truth for the exact live gate while coverage is being ratcheted upward.

The staged plan for raising coverage lives in [docs/coverage-ratchet.md](docs/coverage-ratchet.md).

Supporting release docs:

- [docs/release-checklist.md](docs/release-checklist.md)
- [docs/maestro-release-flows.md](docs/maestro-release-flows.md)
- [docs/coverage-ratchet.md](docs/coverage-ratchet.md)
- [docs/type-safety-strategy.md](docs/type-safety-strategy.md)

## App Areas

- `/kiosk`: kiosk setup, agenda grid, PIN flows
- `/dashboard`: alerts, compliance, overdue work
- `/checklists/*`: checklist library, builder, reporting
- `/infohub/*`: training and document hub
- `/admin`: locations, team members, access and archive flows
- `/billing`: plan and billing UI

## Data Model Notes

- Core operational data is Supabase-backed through hooks in `src/hooks/`
- Auth state is managed in `src/contexts/AuthContext.tsx`
- Some Infohub and dashboard surfaces still use local UI state and are being incrementally migrated

## Mobile E2E

Maestro flows live in `.maestro/flows/`.

Typical run sequence:

```bash
bun run cap:ios
bun run e2e
```

E2E requires:

- Java 21
- Maestro installed at `~/.maestro/bin`
- a booted iOS Simulator or Android Emulator with the app installed

The release-oriented Maestro runbook lives in [docs/e2e-release-gate.md](docs/e2e-release-gate.md), and the full production sign-off checklist lives in [docs/release-checklist.md](docs/release-checklist.md).
- the prerequisites and release grouping documented in [docs/maestro-release-flows.md](docs/maestro-release-flows.md)
