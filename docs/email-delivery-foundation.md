# Email Delivery Foundation

This document defines the current and future email paths for Olia so new flows do not reinvent delivery logic.

## Current State

### Operational Alerts

- delivery owner: Resend
- execution path: Postgres trigger -> `send-alert-email` Edge Function -> Resend API
- templates/content: `supabase/functions/send-alert-email/email.ts`
- environment audit: `bun run resend:audit`

### Signup Confirmation

- delivery owner: Supabase Auth
- execution path: Supabase managed auth email
- branding/delivery: configured in Supabase Auth, not in app code

### Passwordless Login

- current product path: Supabase OTP via `signInWithOtp` in `src/pages/Login.tsx`
- delivery owner: Supabase Auth
- note: the UI is built, but inbox delivery still depends on Supabase Auth email configuration

## Foundation Rules

- use Resend for product-owned transactional email where we control content and delivery behavior
- use Supabase Auth for auth-managed flows unless there is a strong reason to replace it
- keep template-building logic isolated from handler transport code
- keep delivery configuration auditable from the repo
- every new email flow must document:
  - sender
  - delivery system
  - template location
  - required secrets
  - verification path

## Shared Building Blocks

- hosted audit command: `bun run resend:audit`
- alert email template helpers: `supabase/functions/send-alert-email/email.ts`
- sender fallback policy: use `ALERT_FROM_EMAIL` when configured; development fallback is not production-safe

## Next Flows To Implement On This Foundation

- team invites
- account recovery / security notifications
- branded passwordless code delivery if Supabase Auth email is replaced later

## Decision Matrix

Use Supabase Auth when:

- the flow is fundamentally auth-native
- redirect/callback handling is owned by Supabase
- branded template control is acceptable through Supabase settings

Use Resend when:

- the product owns the content and timing
- delivery needs richer observability
- multiple future flows should share template and transport conventions
