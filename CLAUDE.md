# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use `bun` as the package manager (bun.lockb is present). If `bun` is not in PATH, invoke it as `~/.bun/bin/bun`. See `package.json` scripts for the full command list.

## Quality Standards

These are non-negotiable requirements enforced at every milestone.

### Unit Test Coverage

The aspirational target is 95%, but the actual enforced gate is lower and moves incrementally — **`vitest.config.ts` is the source of truth**, never this doc. As of this writing the enforced `thresholds` block there is:

| Metric     | Enforced (vitest.config.ts) |
|------------|------------------------------|
| Lines      | 65%       |
| Functions  | 50%       |
| Branches   | 55%       |
| Statements | 65%       |

These are raised a few points at a time as the suite gets more coverage — see `docs/coverage-ratchet.md` for the ratchet policy. Don't hardcode 95% anywhere else (docs, CI configs, PR checklists); point to `vitest.config.ts` instead so this doesn't drift again.

Coverage is measured with **Vitest + the v8 provider**, configured in `vitest.config.ts`.
HTML report is written to `./coverage/index.html` after each run.

Excluded from coverage (generated/bootstrap — not our business logic):
- `src/components/ui/**` — shadcn/ui generated components
- `src/main.tsx` — Capacitor native bootstrap
- `src/test/**` — test setup and fixtures

**Every new feature or bug fix must ship with tests that keep coverage at or above the enforced gate in `vitest.config.ts`.**

#### What coverage does NOT guarantee

95% line coverage means every line ran — it does not mean every *sequence of events* was tested. The most dangerous bugs in this codebase live in **state transitions**, not in individual lines. When writing tests for stateful code (auth, loading flags, mutations), always ask: "have I tested what happens if this state was already set to X before this event fired?"

Two rules that catch the bugs coverage misses:

1. **Loading state ownership** — any async function that should block the UI must set `loading = true` at its own entry point, regardless of what the caller already did. Never rely on an external caller having set it.

2. **Sequence tests, not just end-state tests** — for auth and async flows, write at least one test that asserts the *intermediate* state (e.g. `loading = true` while the fetch is in flight), not only the final result. Use a deferred promise to pause the mock mid-flight and inspect state.

### E2E Tests — 100% passing

Maestro flows in `.maestro/flows/` must all pass before a milestone is signed off. See the `run-e2e` skill for the flow list, run commands, and environment requirements.

### Milestone Checklist

Before marking any milestone complete, run:

```bash
bun run milestone
```

This runs in sequence and fails fast:
1. `bun run lint` — zero ESLint errors
2. `bun run test:ci` — all unit tests pass AND coverage clears the thresholds in `vitest.config.ts`
3. `bun run build` — production build succeeds
4. (manual) `bun run e2e` — all Maestro flows pass on simulator

## Architecture

**Olia** is a mobile-first PWA for hospitality operations management. Uses Supabase for auth, database, and edge functions. React Query manages server state; local UI state uses `useState`.

### Shared State & Data Layer

**`src/lib/supabase.ts`** — Supabase client (`createClient`).

**`src/contexts/AuthContext.tsx`** — Auth context wrapping `supabase.auth`. Provides `useAuth()` → `{ user, session, teamMember, loading, signOut }`.

**`src/hooks/useChecklists.ts`** — React Query hooks for folders & checklists CRUD (Supabase-backed).

**`src/hooks/useChecklistLogs.ts`, `useActions.ts`, `useLocations.ts`, `useStaffProfiles.ts`, `useTeamMembers.ts`** — React Query hooks for other Supabase tables.

**`src/lib/alerts-store.ts`** — Pub/sub store for operational alerts using `useSyncExternalStore`. Shared between Dashboard, Notifications, and Checklists.

**`src/lib/admin-repository.ts`** — Helper functions: `hashPin()`, `getInitials()`, `daysAgo()`.

**`src/lib/plan-features.ts`** — Billing plan definitions (Starter/Growth/Pro).

**`src/lib/export-utils.ts`** — PDF & CSV export helpers using jsPDF + jspdf-autotable.

Infohub documents/training are Supabase-backed via `useInfohubContent` (React Query → `infohub_folders` + `infohub_documents`). Some Dashboard data still lives in local `useState`.

### Key UI Patterns
- **Bottom sheet modals:** Fixed overlay with `rounded-t-2xl`, slides up from bottom, max-height 85vh
- **3-dot context menus:** Positioned absolutely, closed via `useEffect` + mousedown listener
- **Drag-to-reorder:** Native HTML drag events (`onDragStart`, `onDragOver`, `onDrop`) with GripVertical icon handles
- **Score rings:** SVG circles with dynamic color (≥85% green, ≥65% amber, <65% red)

### Design System
Color/font tokens are defined in `src/index.css`.

shadcn/ui components are in `src/components/ui/` — do not edit these files manually; use the shadcn CLI to add/update them.

### Billing / Stripe
Stripe checkout, the customer portal, and webhook sync are real and live (`supabase/functions/create-checkout-session`, `confirm-checkout-session`, `stripe-webhook`) — this is not UI-only. The connected Stripe account is currently in **test/sandbox mode**. Plan tier is derived server-side from the purchased Stripe price/product, never from client input (see `supabase/functions/_shared/plan-from-price.ts`).

### TypeScript Config
Strict mode is disabled (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`). The codebase does not require explicit null checks or strict typing.

### Path Aliases
`@/` maps to `src/` — use this for all imports within the project.
