# AGENTS.md

This file provides working guidance for Codex and other coding agents in this repository.

## Package Manager

Use Bun for installs and scripts.

```bash
bun install
bun run dev
bun run build
bun run lint
bun run test
bun run test:watch
bun run test:coverage
bun run test:ci
bun run milestone
bun run e2e
```

If `bun` is not on `PATH`, use `~/.bun/bin/bun`.

## Git Workflow Rules

- Never push or merge directly to `main`.
- All code changes must land through a feature branch and pull request.
- Treat `main` as protected, even if local tooling would technically allow direct edits.
- Prefer small, reviewable PRs over broad mixed branches.
- Do not revert unrelated user changes in a dirty worktree.
- Every new task, bug, feature, or cleanup item must be tracked in GitHub before implementation starts.
- When creating a new GitHub task, apply the appropriate existing labels and assign the best-fit milestone when possible.
- Prefer linking work to an existing GitHub issue when one already exists; create a new issue only when the work is not already tracked.

## Quality Expectations

- `bun run lint` should stay free of errors.
- `bun run build` should succeed before shipping changes.
- `bun run test:ci` is the unit/integration gate.
- `bun run e2e` is the manual mobile release gate.

The aspirational coverage target is 95%, but the exact live enforced thresholds can change while the repo is being stabilized. Always treat `vitest.config.ts` as the source of truth for the current enforced thresholds.

## Architecture Snapshot

- React 18 + TypeScript + Vite
- React Router v6
- Supabase for auth, database, and edge functions
- React Query for server state
- Tailwind CSS + shadcn/ui for UI
- Capacitor for iOS and Android builds

Key areas:

- `src/pages/Kiosk.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Infohub.tsx`
- `src/pages/Admin.tsx`
- `src/pages/checklists/`

Shared state and data hooks live mainly in:

- `src/contexts/AuthContext.tsx`
- `src/hooks/useChecklists.ts`
- `src/hooks/useChecklistLogs.ts`
- `src/hooks/useActions.ts`
- `src/hooks/useLocations.ts`
- `src/lib/supabase.ts`

## Working Style

- Preserve existing UI patterns unless the task explicitly calls for redesign.
- Prefer isolated fixes and focused test updates over sweeping rewrites.
- When a test is stale, update it to current product behavior instead of restoring removed UI.
- Keep generated or vendored content out of lint and review scope.
