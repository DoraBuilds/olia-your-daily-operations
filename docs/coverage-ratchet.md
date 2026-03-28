# Coverage Ratchet Plan

The enforced thresholds live in `vitest.config.ts`. This document defines how to move them upward without freezing delivery.

## Current Policy

- `bun run test:ci` is the enforced unit/integration gate.
- Coverage is measured on executed files only for now.
- Thresholds should move in small ratchets after new tests land, not in one strict-mode jump.
- The current enforced thresholds are:
  - lines: `65`
  - functions: `50`
  - branches: `55`
  - statements: `65`

## Ratchet Rules

- Raise thresholds only after the current suite is green on `bun run test:ci`.
- Prefer raising all four thresholds together in small steps.
- Do not raise thresholds to numbers the current suite barely clears. Leave margin for normal churn.

## High-Value Test Targets

- `src/pages/Kiosk.tsx`
- `src/pages/Admin.tsx`
- `src/pages/Infohub.tsx`
- `src/pages/checklists/ChecklistBuilderModal.tsx`
- Supabase edge-function helpers and runtime config boundaries

## Ratchet Sequence

1. Stabilize coverage around the current enforced baseline after the recent kiosk, admin, checklist, and Infohub work.
2. Raise thresholds by 2-5 points once the suite clears with comfortable headroom.
3. Repeat after each high-risk module receives targeted tests.
4. Move from executed-file coverage toward broader file inclusion only after the current toolchain path is stable.

## Release Expectation

The aspirational target remains much higher than the current enforced gate. Release readiness depends on both the numeric threshold and targeted coverage in the riskiest modules.
