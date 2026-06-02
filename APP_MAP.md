# Olia — App Map

**What it is:** Mobile-first PWA for hospitality operations management (checklists, staff, alerts, kiosk).
**Stack:** React 18 + TypeScript + Vite · Supabase (auth + Postgres + edge functions) · React Query · Tailwind + shadcn/ui · Capacitor (iOS/Android) · Vitest for tests · `bun` as package manager.

---

## Modules

| Module | Route | Key files | Owns |
|--------|-------|-----------|------|
| **kiosk** | `/kiosk` | `src/pages/Kiosk.tsx`, `src/pages/kiosk/` | Public-facing tablet UI, staff PIN entry, checklist runner, photo upload, offline queue |
| **dashboard** | `/dashboard` | `src/pages/Dashboard.tsx` | Greeting, live stat strip, compliance summary, overdue actions, alerts |
| **checklists** | `/checklists/*` | `src/pages/Checklists.tsx`, `src/pages/checklists/` | Checklist builder, folders, reporting tab, PDF/CSV export |
| **infohub** | `/infohub/*` | `src/pages/Infohub.tsx` | Training docs, policies — data is still local mock |
| **admin** | `/admin` | `src/pages/Admin.tsx` | Team members, locations, PINs, billing plan, account settings |
| **billing** | `/billing` | `src/pages/Billing.tsx` | Stripe checkout, plan upgrade UI |

---

## Shared Services (touch these only when the task explicitly requires it)

| Layer | Files | Purpose |
|-------|-------|---------|
| Auth | `src/contexts/AuthContext.tsx` | `useAuth()` → user, teamMember, signOut |
| Data hooks | `src/hooks/use*.ts` | React Query wrappers for every Supabase table |
| Layout | `src/components/Layout.tsx`, `src/components/BottomNav.tsx` | Page shell, 4-tab nav |
| Supabase client | `src/lib/supabase.ts` | Single `createClient` instance |
| Offline queue | `src/lib/submission-queue.ts` | localStorage retry queue for kiosk submissions |
| Security | `src/lib/sanitize.ts` | Image URL allowlist (XSS guard) |
| Export | `src/lib/export-utils.ts` | PDF + CSV via jsPDF |
| Plans | `src/lib/plan-features.ts` | starter / growth / enterprise feature gates |

---

## Database (Supabase)

Key tables: `organizations`, `team_members`, `staff_profiles`, `locations`, `checklists`, `checklist_logs`, `actions`, `alerts`, `folders`.
Migrations live in `supabase/migrations/` — always add a new file, never edit existing ones.
All security-sensitive DB functions use `SECURITY DEFINER SET search_path = public`.

---

## Testing Rules

- Run: `~/.bun/bin/bun run test` (all) or `~/.bun/bin/bun run test -- src/test/pages/Kiosk.test.tsx` (one file)
- Test files mirror source: `src/pages/Foo.tsx` → `src/test/pages/Foo.test.tsx`
- 95% coverage required across lines / functions / branches / statements
- Only run tests for files you actually changed — don't run the full suite to check one module
- Coverage provider: istanbul (not v8). Pool: default (not bun forks).

---

## Design Tokens (don't change these without explicit design instruction)

Colors in `src/index.css`: `--sage` = Midnight Blue #1A2A47 · `--lavender` = Dusty Lavender #B8A5C8 · `--background` = Alabaster White #FDFAF7.
Fonts: `font-display` = DM Serif Display · `font-body` = DM Sans.
