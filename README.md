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
```

## Workflow

- Do not push or merge directly to `main`.
- Create a branch for every change.
- Open a pull request for all work, including small fixes.
- Treat `main` as protected even if local tooling would allow direct changes.

## Quality Gates

The intended milestone gate is:

1. `bun run lint`
2. `bun run test:ci`
3. `bun run build`
4. `bun run e2e` on a simulator or emulator

The current enforced unit-test thresholds live in [vitest.config.ts](/Users/doraangelov/Desktop/OLIA%20%E2%9C%A8/olia-docs/vitest.config.ts). Treat that file as the source of truth for the exact live gate while coverage is being ratcheted upward.

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
