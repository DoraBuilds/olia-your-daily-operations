#!/bin/sh

set -eu

if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  else
    echo "bun is required to start the live Playwright dev server." >&2
    exit 1
  fi
else
  BUN_BIN="bun"
fi

api_url="${VITE_SUPABASE_URL:-}"
anon_key="${VITE_SUPABASE_ANON_KEY:-}"

if [ -z "$api_url" ] || [ -z "$anon_key" ]; then
  if ! command -v supabase >/dev/null 2>&1; then
    echo "Supabase CLI is required when live Playwright env is not already set." >&2
    exit 1
  fi

  strip_wrapping_quotes() {
    value="$1"
    value="${value#\"}"
    value="${value%\"}"
    printf '%s' "$value"
  }

  supabase start >/dev/null

  status_output="$(supabase status -o env)"
  api_url="$(printf '%s\n' "$status_output" | sed -n 's/^API_URL=//p' | tail -n 1)"
  anon_key="$(printf '%s\n' "$status_output" | sed -n 's/^ANON_KEY=//p' | tail -n 1)"

  api_url="$(strip_wrapping_quotes "$api_url")"
  anon_key="$(strip_wrapping_quotes "$anon_key")"
fi

if [ -z "$api_url" ] || [ -z "$anon_key" ]; then
  echo "Could not resolve local Supabase API env for the live Playwright server." >&2
  exit 1
fi

VITE_SUPABASE_URL="$api_url" \
VITE_SUPABASE_ANON_KEY="$anon_key" \
VITE_PUBLIC_SITE_URL="http://127.0.0.1:4173" \
"$BUN_BIN" run dev --host 127.0.0.1 --port 4173
