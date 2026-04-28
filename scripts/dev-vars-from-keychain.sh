#!/usr/bin/env bash
# Generates worker/.dev.vars from secrets stored in macOS Keychain.
# .dev.vars is gitignored — keys never touch git or the shell history.

set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/worker/.dev.vars"

read_kc() {
  security find-generic-password -s "family-trip-planner/$1" -a "$USER" -w 2>/dev/null || true
}

ANTHROPIC=$(read_kc anthropic-api-key)
SUPA_JWT=$(read_kc supabase-jwt-secret)

missing=()
[[ -z "$ANTHROPIC" ]] && missing+=("anthropic-api-key")
[[ -z "$SUPA_JWT" ]]  && missing+=("supabase-jwt-secret")
if (( ${#missing[@]} )); then
  printf "Missing in Keychain: %s\nRun scripts/setup-keychain.sh first.\n" "${missing[*]}" >&2
  exit 1
fi

umask 077
{
  printf "ANTHROPIC_API_KEY=%s\n" "$ANTHROPIC"
  printf "SUPABASE_JWT_SECRET=%s\n" "$SUPA_JWT"
} > "$OUT"

printf "✔ wrote %s (mode 600)\n" "$OUT"
