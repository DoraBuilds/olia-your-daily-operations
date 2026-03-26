# Olia E2E Test Suite

Playwright E2E tests for the highest-risk areas of the Olia app.

## What's covered

| Spec | What it tests |
|------|---------------|
| `kiosk-tabs.spec.ts` | Setup screen, stat strip, Due now / Upcoming / Done tabs, Admin modal |
| `training-completion.spec.ts` | Kiosk training flow via InfoHub |
| `dashboard.spec.ts` | Greeting, stat strip, location cards, drill-down, back arrow, overdue tab |
| `infohub.spec.ts` | Library/Training tabs, create doc, edit doc, context menus (no Manage access), AI tools disabled |
| `reporting.spec.ts` | Reporting tab, location filter, export CSV/PDF, chart renders |
| `convert-file.spec.ts` | ConvertFileModal drop zone, file selection, success path, error humanisation |

## Architecture: no real database

All specs mock Supabase REST API calls via `page.route()`. Tests never hit a
live database. This makes them fast, hermetic, and safe to run in CI without
credentials.

Auth is injected client-side via `e2e/fixtures/auth.ts` — any Supabase auth
token key in `localStorage` is intercepted and returns a fake session.

The SQL seed in `supabase/seeds/e2e_seed.sql` is provided for **manual smoke
testing** against a real staging project; it is not used by the Playwright run.

---

## Prerequisites

### 1. Install Playwright browsers (one-time)

```bash
# From the project root
~/.bun/bin/bun x playwright install chromium
```

Alternatively, using npx if bun doesn't resolve playwright:
```bash
npx playwright install chromium
```

### 2. Confirm Playwright is installed

```bash
~/.bun/bin/bun x playwright --version
# or
npx playwright --version
```

If it's not installed as a dev dependency yet:
```bash
~/.bun/bin/bun add -d @playwright/test
```

---

## Running E2E tests

### Step 1 — Start the dev server

In a **separate terminal**, run:
```bash
bun run dev
# Server starts at http://localhost:8080
```

Keep it running for the duration of the test session.

### Step 2 — Run all E2E specs

```bash
~/.bun/bin/bun x playwright test --config e2e/playwright.config.ts
```

Or using npx:
```bash
npx playwright test --config e2e/playwright.config.ts
```

### Run a single spec

```bash
# Dashboard only
npx playwright test e2e/dashboard.spec.ts --config e2e/playwright.config.ts

# InfoHub only
npx playwright test e2e/infohub.spec.ts --config e2e/playwright.config.ts

# Convert file only
npx playwright test e2e/convert-file.spec.ts --config e2e/playwright.config.ts
```

### Run in headed mode (see the browser)

```bash
npx playwright test --config e2e/playwright.config.ts --headed
```

### Run with slow motion (easier to follow)

```bash
npx playwright test --config e2e/playwright.config.ts --headed --slow-mo 500
```

---

## Viewing failures

On failure, Playwright writes screenshots and traces to the default output
directory. To view a trace:

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

Or open the HTML report:
```bash
npx playwright show-report
```

---

## Fixture files

| File | Purpose |
|------|---------|
| `e2e/fixtures/auth.ts` | Injects fake Supabase session; mocks auth endpoints + `team_members` table |
| `e2e/fixtures/supabase.ts` | Table mock helpers (`mockTable`, `mockAllTables`, `mockEdgeFunction`) + shared fixture data |
| `e2e/helpers/mock-supabase.ts` | Legacy helpers used by kiosk + training specs |
| `e2e/playwright.config.ts` | Playwright configuration (baseURL, timeout, chromium only) |

---

## Test IDs in production source

These `data-testid` attributes were added specifically to support E2E selectors:

| `data-testid` | File | What it is |
|---|---|---|
| `kiosk-tab-due` | `Kiosk.tsx` | "Due now" stat strip button |
| `kiosk-tab-upcoming` | `Kiosk.tsx` | "Upcoming" stat strip button |
| `kiosk-tab-done` | `Kiosk.tsx` | "Done" stat strip button |
| `compliance-tab-today` | `Dashboard.tsx` | Compliance "today" filter tab |
| `compliance-tab-yesterday` | `Dashboard.tsx` | Compliance "yesterday" filter tab |
| `compliance-tab-overdue` | `Dashboard.tsx` | Compliance "overdue" filter tab |
| `location-card` | `Dashboard.tsx` | Location compliance card button |
| `overdue-checklist-item` | `Dashboard.tsx` | Missed checklist row in overdue tab |
| `location-filter` | `ReportingTab.tsx` | Location filter `<select>` |
| `export-csv` | `ReportingTab.tsx` | Export CSV button |
| `export-pdf` | `ReportingTab.tsx` | Export PDF button |
| `convert-drop-zone` | `ConvertFileModal.tsx` | File drop zone in Convert modal |
| `doc-title-input` | `Infohub.tsx` | Title input in Create doc modal |
| `doc-tags-input` | `Infohub.tsx` | Tags input in Create doc modal |
| `create-doc-submit` | `Infohub.tsx` | Submit button in Create doc modal |
| `doc-edit-btn` | `Infohub.tsx` | Edit button in Library doc detail |
| `doc-save-btn` | `Infohub.tsx` | Save button in Library doc detail (edit mode) |
| `doc-content-editor` | `Infohub.tsx` | Content textarea in Library doc detail (edit mode) |

---

## Smoke testing against a real database

If you want to run against a real Supabase staging project (not recommended
for regular CI but useful for debugging auth/RLS issues):

```bash
# 1. Apply migrations
supabase db reset

# 2. Seed test data
psql $DATABASE_URL -f supabase/seeds/e2e_seed.sql

# 3. Create the E2E test user in Supabase Auth dashboard
#    Email: e2e@olia.app
#    Password: (any — you'll use it to log in once for session capture)
#    User ID: 00000000-0000-0000-0000-000000000001

# 4. Uncomment the team_members INSERT in e2e_seed.sql and re-run it

# 5. Point VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at staging in .env.local

# 6. Remove the page.route() mocks from the spec you want to test
#    (or create a separate "live" variant that does not mock REST calls)
```

> ⚠️  Do NOT run live-database E2E tests against production — they write data.
