# Email Platform Notes

This repo currently has two distinct email paths:

- Supabase Auth email for signup confirmation and auth callbacks
- Resend-backed operational alert email via `supabase/functions/send-alert-email`

## Reusable Foundation

Reusable email behavior should live in shared helpers, not inside each future feature.

Current shared building blocks:

- `supabase/functions/send-alert-email/email.ts`
  - sender resolution
  - development fallback sender handling
  - alert email subject/body generation
- `scripts/check-resend-hosted-setup.mjs`
  - hosted project audit for required Resend secrets and active function deployment

## Future Flows That Should Reuse The Same Foundation

- team invites
- passwordless one-time codes
- account recovery or verification mail
- operational notifications beyond alerts

## Rules For New Email Flows

- keep secrets in Supabase Edge Function secrets, not frontend env
- centralize sender selection and branded HTML/text wrapping
- make each flow auditable with a documented hosted verification command or runbook
- prefer small shared helpers over copying inline HTML templates into each function

## Current Gaps

- invites are not built yet
- passwordless login exists in the UI, but delivery still depends on Supabase Auth rather than a dedicated Resend flow
- live end-to-end delivery verification still needs a branded sender domain for production readiness
