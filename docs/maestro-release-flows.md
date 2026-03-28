# Maestro Release Flows

This document defines how the `.maestro/flows/` suite should be used for release sign-off.

## Required Prerequisites

- Java 21 available on the machine
- Maestro installed at `~/.maestro/bin`
- iOS Simulator or Android Emulator booted
- current app build installed
- target environment selected before launch

## Flow Groups

### Kiosk Smoke

```bash
bun run e2e:kiosk
```

Covers:

- kiosk setup screen
- kiosk grid shell
- kiosk admin PIN modal

Notes:

- these flows assume a kiosk location is already available in the environment
- the admin modal now uses PIN, not email/password

### Authenticated Navigation

```bash
bun run e2e:nav
bun run e2e:admin
```

Covers:

- dashboard shell
- bottom navigation
- checklists tab shell
- infohub shell
- admin shell

Notes:

- authenticate manually before running these flows
- the current release gate does not try to automate inbox access for one-time codes

### Checklist Runner

```bash
bun run e2e:runner
```

Covers:

- kiosk checklist entry path
- PIN modal open/close behavior

Notes:

- run against a seeded location with at least one visible checklist

## Known Constraints

- dashboard/admin/infohub flows depend on a valid signed-in session
- kiosk runner flows depend on seeded checklist data
- Maestro is a release gate, not the only verification path; pair it with the manual checklist in [docs/release-checklist.md](./release-checklist.md)

## Failure Handling

If a required flow fails:

- capture the failing flow name and screenshot
- record whether the issue is environment-only or product behavior
- do not sign off the release until the failure is understood or explicitly waived
