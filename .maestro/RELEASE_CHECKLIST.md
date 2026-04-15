# Olia Release Sign-Off Checklist

Use this checklist before merging to `main` and after every production deploy.
All gates must be green before a release is signed off.

---

## 1. Pre-Release Gates

### 1a. Milestone gate (automated)

Run this from the repo root. It must complete with zero failures:

```bash
~/.bun/bin/bun run milestone
```

This runs in sequence and fails fast:

- [ ] `bun run lint` — zero ESLint errors
- [ ] `bun run test:ci` — all unit tests pass AND all four coverage metrics (lines, functions, branches, statements) are at or above the configured thresholds
- [ ] `bun run build` — production build succeeds with no errors or warnings

### 1b. Maestro e2e flows (manual, requires simulator)

Boot an iOS Simulator (or Android Emulator) with the app installed, then run:

```bash
~/.bun/bin/bun run e2e
```

All 10 flows must pass:

- [ ] **01** `01-kiosk-setup.yaml` — Setup screen: branding, location prompt, Launch Kiosk button, System Online footer
- [ ] **02** `02-kiosk-grid.yaml` — Grid screen: agenda heading, stat strip (Total / Completed / Remaining), Olia + Admin header
- [ ] **03** `03-pin-entry-modal.yaml` — PIN modal: "Insert PIN" heading, subtitle text, circular numpad, START button, dismiss returns to grid
- [ ] **04** `04-admin-login-modal.yaml` — Admin PIN modal: opens from grid Admin button, PIN input, Continue button, dismiss returns to grid
- [ ] **05** `05-dashboard.yaml` — Dashboard: greeting visible when authenticated, bottom nav tabs visible
- [ ] **06** `06-bottom-navigation.yaml` — All 5 nav tabs reachable: Dashboard, Checklists, Reporting, Infohub, Admin
- [ ] **07** `07-checklists-tab.yaml` — Checklists page loads and page heading is visible
- [ ] **08** `08-infohub-tab.yaml` — Infohub Library/Training sub-tabs visible, Training tap works
- [ ] **09** `09-checklist-runner.yaml` — Full kiosk runner: setup → grid → PIN modal → digits → dismiss → back to grid
- [ ] **10** `10-admin-page.yaml` — Admin page: My Location / Account tabs, "Launch Kiosk Mode" button, Manage Billing button in Account tab

---

## 2. Manual Smoke Checks

Run these manually on a device or simulator connected to the staging/production Supabase project.

### 2a. Authentication

- [ ] Visiting `/dashboard` unauthenticated redirects to `/kiosk`
- [ ] Kiosk Admin button opens the Admin PIN modal
- [ ] A valid Admin PIN navigates to `/admin`
- [ ] Signing out from Admin returns to `/kiosk`
- [ ] Auth callback URL (Supabase email magic link / OAuth) resolves correctly after login

### 2b. Kiosk flow

- [ ] Setup screen shows the saved location (or the location picker) on re-open
- [ ] Tapping "Launch Kiosk" loads the agenda grid
- [ ] Checklist cards display correct titles fetched via `get_kiosk_checklists` RPC
- [ ] Stat strip shows live counts (Total / Completed / Remaining)
- [ ] Tapping a checklist card opens the PIN modal with circular numpad
- [ ] An incorrect PIN shows "PIN not recognised" error
- [ ] A correct PIN launches the checklist runner
- [ ] System Online footer is visible in both setup and grid screens

### 2c. Admin area

- [ ] My Location tab loads with team member list and "Launch Kiosk Mode" button
- [ ] Account tab is visible only for Owner role
- [ ] Account tab shows the billing card with current plan name and "Manage Billing" button
- [ ] "Manage Billing" navigates to `/billing`
- [ ] Creating, editing, and deleting a team member works end-to-end

### 2d. Checklists

- [ ] Checklists page loads the folder/checklist tree from Supabase
- [ ] Creating a new checklist folder and checklist works
- [ ] Drag-to-reorder folders updates order correctly
- [ ] Reporting tab (`/reporting`) loads with Today / This Week / This Month period tabs
- [ ] Export PDF and Export CSV produce downloadable files

### 2e. Infohub

- [ ] Library sub-tab loads at `/infohub/library`
- [ ] Training sub-tab loads at `/infohub/training`
- [ ] Direct navigation to `/infohub` redirects to `/infohub/library`
- [ ] Documents section shows folders/docs (or empty state)

### 2f. Dashboard

- [ ] Greeting shows correct time-of-day salutation with authenticated user's name
- [ ] Stat strip counts match live Supabase data
- [ ] Compliance score ring renders (green ≥ 85%, amber ≥ 65%, red < 65%)
- [ ] Alerts panel reflects current alerts from `useAlerts` hook (30 s refresh)

---

## 3. Deployment Steps

### 3a. GitHub Pages (web)

Deployment is automatic on merge to `main` via `.github/workflows/github-pages.yml`.

1. [ ] Merge the release branch to `main`
2. [ ] Confirm the **github-pages** workflow completes successfully in GitHub Actions
3. [ ] Confirm the **pr-unit-tests** workflow shows green on the merge commit

### 3b. Native builds (iOS / Android)

Only required for App Store / Play Store releases:

```bash
~/.bun/bin/bun run cap:ios     # build + sync + open Xcode
~/.bun/bin/bun run cap:android # build + sync + open Android Studio
```

- [ ] iOS build compiles without errors in Xcode
- [ ] Android build compiles without errors in Android Studio
- [ ] App version number bumped in `package.json` (and synced to `Info.plist` / `build.gradle`)

---

## 4. Post-Deploy Verification

After the GitHub Pages deployment URL is live:

- [ ] Home URL loads the kiosk setup screen (not a blank page or 404)
- [ ] Deep-linking to `/dashboard` correctly redirects unauthenticated users to `/kiosk` (routing loop fix is active — see `404.html` + `index.html` redirect script)
- [ ] Auth callback URL resolves (Supabase `SITE_URL` and `REDIRECT_URLS` match the deployed origin)
- [ ] Hard refresh on any sub-route (e.g. `/admin`) does not produce a 404
- [ ] No JS console errors on initial load
- [ ] Kiosk loads and shows checklists (RLS anon policy + `get_kiosk_checklists` RPC is active)

---

## 5. Sign-Off

| Gate | Owner | Status |
|------|-------|--------|
| `bun run milestone` green | Engineer | ☐ |
| All 10 Maestro flows pass | Engineer | ☐ |
| Manual smoke checks complete | QA / Engineer | ☐ |
| GitHub Pages deployment green | CI | ☐ |
| Post-deploy routing + auth verified | Engineer | ☐ |

**Release signed off by:** ___________________  **Date:** ___________
