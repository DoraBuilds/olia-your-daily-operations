# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev              # Start dev server at http://localhost:8080
bun run build            # Production build
bun run lint             # ESLint
bun run test             # Run unit tests once
bun run test:watch       # Unit tests in watch mode
bun run test:coverage    # Unit tests + coverage report (./coverage/index.html)
bun run test:ci          # Unit tests + coverage WITH 95% threshold enforcement
bun run milestone        # Full milestone gate: lint + test:ci + build (must all pass)
bun run e2e              # Run all Maestro e2e flows (simulator must be running)
bun run e2e:kiosk        # Kiosk flows only (01–03)
bun run e2e:admin        # Admin flows
bun run e2e:nav          # Navigation flows
bun run e2e:runner       # Checklist runner flows
bun run e2e:studio       # Open Maestro Studio (visual recorder)
bun run cap:ios          # Sync & open iOS project
bun run cap:android      # Sync & open Android project
bun install              # Install dependencies
```

Use `bun` as the package manager (bun.lockb is present). If `bun` is not in PATH, invoke it as `~/.bun/bin/bun`.

## Quality Standards

These are non-negotiable requirements enforced at every milestone.

### Unit Test Coverage — 95% minimum

All four coverage metrics must be ≥ 95% to pass `bun run test:ci`:

| Metric     | Threshold |
|------------|-----------|
| Lines      | 95%       |
| Functions  | 95%       |
| Branches   | 95%       |
| Statements | 95%       |

Coverage is measured with **Vitest + istanbul**, configured in `vitest.config.ts`.
HTML report is written to `./coverage/index.html` after each run.

Excluded from coverage (generated/bootstrap — not our business logic):
- `src/components/ui/**` — shadcn/ui generated components
- `src/main.tsx` — Capacitor native bootstrap
- `src/test/**` — test setup and fixtures

**Every new feature or bug fix must ship with tests that keep coverage at or above 95%.**

### E2E Tests — 100% passing

Maestro flows in `.maestro/flows/` must all pass before a milestone is signed off.

| Flows | Coverage |
|-------|----------|
| `01` Kiosk setup screen | UI elements, mock fallback locations |
| `02` Kiosk grid | Setup → Launch → agenda grid |
| `03` PIN entry modal | Numpad, backspace, dismiss |
| `04` Admin login modal | Form, validation, close |
| `05–08` Authenticated pages | Dashboard, nav, checklists, infohub |
| `09` Checklist runner | Full PIN + runner flow |
| `10` Admin page | My Location + Account tabs |

Run e2e tests with a simulator booted and the app installed:
```bash
bun run cap:ios       # or cap:android
bun run e2e
```

E2e tests require:
- Java 21 at `~/Library/Java/jdk21`
- Maestro at `~/.maestro/bin`
- iOS Simulator or Android Emulator running with the app installed

### Milestone Checklist

Before marking any milestone complete, run:

```bash
bun run milestone
```

This runs in sequence and fails fast:
1. `bun run lint` — zero ESLint errors
2. `bun run test:ci` — all unit tests pass AND coverage ≥ 95%
3. `bun run build` — production build succeeds
4. (manual) `bun run e2e` — all Maestro flows pass on simulator

## Architecture

**Olia** is a mobile-first PWA for hospitality operations management. Uses Supabase for auth, database, and edge functions. React Query manages server state; local UI state uses `useState`.

### Stack
- React 18 + TypeScript + Vite (SWC)
- React Router v6 for routing
- Supabase (auth + Postgres + edge functions)
- React Query (`@tanstack/react-query`) for data fetching
- Tailwind CSS + shadcn/ui (Radix UI) for UI
- Recharts for charts (LineChart in ReportingTab)
- Vitest + Testing Library for tests
- Capacitor for iOS/Android builds

### Page Structure
Routes are defined in `src/App.tsx`:

| Route | File | Size |
|-------|------|------|
| `/kiosk` | `src/pages/Kiosk.tsx` | ~1077 lines |
| `/dashboard` | `src/pages/Dashboard.tsx` | ~587 lines |
| `/notifications` | `src/pages/Notifications.tsx` | — |
| `/checklists/*` | `src/pages/Checklists.tsx` | ~41 lines (shell) |
| `/infohub/*` | `src/pages/Infohub.tsx` | ~1213 lines |
| `/admin` | `src/pages/Admin.tsx` | ~1338 lines |
| `/billing` | `src/pages/Billing.tsx` | — |
| `*` | `src/pages/NotFound.tsx` | — |

Checklists is split into sub-modules in `src/pages/checklists/` (ChecklistsTab, ReportingTab, ChecklistBuilderModal, etc.). Related sub-components live alongside their parent page.

### Layout System
Every page wraps its content in `src/components/Layout.tsx`, which provides:
- Sticky header with title, subtitle, and optional action controls
- Scrollable content area with fade-in animation
- Fixed bottom nav (`BottomNav.tsx`) with 4 tabs
- Max-width of 480px (mobile-first)

### Shared State & Data Layer

**`src/lib/supabase.ts`** — Supabase client (`createClient`).

**`src/contexts/AuthContext.tsx`** — Auth context wrapping `supabase.auth`. Provides `useAuth()` → `{ user, session, teamMember, loading, signOut }`.

**`src/hooks/useChecklists.ts`** — React Query hooks for folders & checklists CRUD (Supabase-backed).

**`src/hooks/useChecklistLogs.ts`, `useActions.ts`, `useLocations.ts`, `useStaffProfiles.ts`, `useTeamMembers.ts`** — React Query hooks for other Supabase tables.

**`src/lib/alerts-store.ts`** — Pub/sub store for operational alerts using `useSyncExternalStore`. Shared between Dashboard, Notifications, and Checklists.

**`src/lib/admin-repository.ts`** — Helper functions: `hashPin()`, `getInitials()`, `daysAgo()`.

**`src/lib/plan-features.ts`** — Billing plan definitions (Starter/Growth/Pro).

**`src/lib/export-utils.ts`** — PDF & CSV export helpers using jsPDF + jspdf-autotable.

Infohub documents/training and some Dashboard data still live in local `useState`.

### Key UI Patterns
- **Bottom sheet modals:** Fixed overlay with `rounded-t-2xl`, slides up from bottom, max-height 85vh
- **3-dot context menus:** Positioned absolutely, closed via `useEffect` + mousedown listener
- **Drag-to-reorder:** Native HTML drag events (`onDragStart`, `onDragOver`, `onDrop`) with GripVertical icon handles
- **Score rings:** SVG circles with dynamic color (≥85% green, ≥65% amber, <65% red)

### Design System
Color tokens are CSS custom properties defined in `src/index.css`:
- Primary: `--sage` (Midnight Blue #1A2A47), `--lavender` (Dusty Lavender #B8A5C8)
- Backgrounds: `--background` (Alabaster White #FDFAF7), `--card` (white)
- Status: `--status-ok` (Forest Green), `--status-warn` (Warm Amber), `--status-error` (Deep Rose)

Fonts: DM Serif Display for headings (`font-display`), DM Sans for body (`font-body`).

Reusable CSS utility classes: `.status-ok/warn/error`, `.card-surface`, `.section-label`, `.score-ring`.

shadcn/ui components are in `src/components/ui/` — do not edit these files manually; use the shadcn CLI to add/update them.

### What Is Not Yet Built
- "Build with AI" and "Convert File" features in Checklists call Supabase edge functions (AI-powered)
- Export buttons generate real PDFs/CSVs via `src/lib/export-utils.ts`
- Infohub documents/training data is still local mock data (not Supabase-backed)
- No real payment processing (Stripe integration is UI-only)

### TypeScript Config
Strict mode is disabled (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`). The codebase does not require explicit null checks or strict typing.

### Path Aliases
`@/` maps to `src/` — use this for all imports within the project.
