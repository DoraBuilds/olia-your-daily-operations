#!/bin/sh

set -eu

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required for live Playwright smoke tests." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  else
    echo "bun is required to run live Playwright smoke tests." >&2
    exit 1
  fi
else
  BUN_BIN="bun"
fi

strip_wrapping_quotes() {
  value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

read_status_env() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if output="$(supabase status -o env 2>/dev/null)"; then
      printf '%s' "$output"
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

supabase start >/dev/null

status_output="$(read_status_env)" || {
  echo "Could not resolve local Supabase env after waiting for services to recover." >&2
  exit 1
}
api_url="$(printf '%s\n' "$status_output" | sed -n 's/^API_URL=//p' | tail -n 1)"
anon_key="$(printf '%s\n' "$status_output" | sed -n 's/^ANON_KEY=//p' | tail -n 1)"
service_role_key="$(printf '%s\n' "$status_output" | sed -n 's/^SERVICE_ROLE_KEY=//p' | tail -n 1)"

api_url="$(strip_wrapping_quotes "$api_url")"
anon_key="$(strip_wrapping_quotes "$anon_key")"
service_role_key="$(strip_wrapping_quotes "$service_role_key")"

if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_role_key" ]; then
  echo "Could not resolve local Supabase env for the live Playwright smoke lane." >&2
  exit 1
fi

VITE_SUPABASE_URL="$api_url" \
VITE_SUPABASE_ANON_KEY="$anon_key" \
SUPABASE_SERVICE_ROLE_KEY="$service_role_key" \
"$BUN_BIN" x playwright test --config e2e/playwright.live.config.ts "$@"
