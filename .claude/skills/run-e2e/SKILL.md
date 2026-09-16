---
name: run-e2e
description: Run and interpret the Olia project's Maestro end-to-end test flows. Use when running, debugging, or asking about e2e/Maestro tests for this repo.
---

# Running Olia's E2E tests

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

Narrower runs: `bun run e2e:kiosk`, `bun run e2e:admin`, `bun run e2e:nav`, `bun run e2e:runner`, `bun run e2e:studio` (opens Maestro Studio, the visual recorder).

E2e tests require:
- Java 21 at `~/Library/Java/jdk21`
- Maestro at `~/.maestro/bin`
- iOS Simulator or Android Emulator running with the app installed
