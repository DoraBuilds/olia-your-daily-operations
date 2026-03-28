# E2E Release Gate

This repo uses Maestro for mobile smoke coverage. The flows live in `.maestro/flows/`.

## Prerequisites

- Java 21 installed locally.
- Maestro installed at `~/.maestro/bin`.
- A booted iOS Simulator or Android Emulator with the latest app build installed.
- Test data available in the target environment:
  - at least one kiosk-enabled location
  - at least one visible checklist
  - a known admin PIN for kiosk admin access

## Recommended Run Order

- `bun run e2e:kiosk`
- `bun run e2e:runner`
- `bun run e2e:nav`
- `bun run e2e:admin`

Use `bun run e2e` only when you want the full suite in one pass.

## Required Release Smoke Coverage

- `01-kiosk-setup.yaml`
- `02-kiosk-grid.yaml`
- `03-pin-entry-modal.yaml`
- `09-checklist-runner.yaml`

These cover the highest-risk kiosk runtime surfaces.

## Optional Release Smoke Coverage

- `04-admin-login-modal.yaml`
- `05-dashboard.yaml`
- `06-bottom-navigation.yaml`
- `07-checklists-tab.yaml`
- `08-infohub-tab.yaml`
- `10-admin-page.yaml`

These are still useful, but they depend more heavily on seeded auth state or a prepared account session.

## Known Constraints

- Authenticated flows are not yet fully self-seeding. In practice, they are most reliable when run after signing in manually on the simulator.
- If the environment has no kiosk data, the kiosk flows should be treated as blocked rather than flaky.
- If Maestro prerequisites are missing, the release candidate is not fully signed off.
