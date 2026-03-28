# Type Safety Strategy

Olia is intentionally not using repo-wide strict TypeScript yet. This document makes the current posture explicit and defines where stronger typing should happen first.

## Current Posture

- the repo keeps `strictNullChecks` and some related checks relaxed for delivery speed
- ESLint intentionally leaves several TypeScript rules off to match that posture
- this is acceptable only if critical boundaries are typed and verified deliberately

## Typed-First Boundaries

These areas should be the first place we tighten typing:

- runtime config and environment parsing
- Supabase row mapping and repository boundaries
- shared JSON models used by checklist sections, Infohub content, and training state
- edge-function payloads and email helpers

Examples already following this direction:

- `src/lib/runtime-config.ts`
- `src/lib/infohub-access.ts`
- `supabase/functions/send-alert-email/email.ts`
- `src/hooks/useTrainingProgress.ts`

## Working Rules

- prefer adding explicit types at module boundaries before enabling repo-wide strict flags
- convert `any` to narrow domain types when touching Supabase, env, or JSON-heavy code
- add tests alongside boundary hardening so type changes are backed by behavior checks
- avoid giant all-at-once strictness flips that would create noisy churn across the repo

## Next Safe Ratchets

1. Tighten new repository and hook modules first.
2. Prefer typed mappers between Supabase rows and UI models instead of passing raw rows through pages.
3. Add more helper-level tests around parsers, adapters, and edge-function payloads.
4. Revisit stricter compiler and ESLint flags only after the high-risk modules are stable.
