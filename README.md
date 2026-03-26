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
- `public/404.html` rewrites direct deep links back to the app so refreshes and bookmark URLs keep working.
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

For the common “boot local Supabase and start the app” flow, use:

```bash
bun run dev:local
```

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

## Common Commands

```bash
bun run dev
bun run build
bun run lint
bun run test
bun run test:watch
bun run test:coverage
bun run test:ci
bun run milestone
bun run e2e
bun run cap:ios
bun run cap:android
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
- Reuse an existing GitHub issue when the work is already tracked; create a new issue only for genuinely new work.

## Quality Gates

The intended milestone gate is:

1. `bun run lint`
2. `bun run test:ci`
3. `bun run build`
4. `bun run e2e` on a simulator or emulator

The current enforced unit-test thresholds live in `vitest.config.ts`. Treat that file as the source of truth for the exact live gate while coverage is being ratcheted upward.

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
