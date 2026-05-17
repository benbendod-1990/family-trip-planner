#!/usr/bin/env bash
# Generates worker/.dev.vars from secrets stored in macOS Keychain.
# .dev.vars is gitignored — keys never touch git or the shell history.

set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/worker/.dev.vars"

read_kc() {
  # Account-name convention drifted between adds: most keys use $USER, but
  # supabase-service-key was originally stored under the email. Try both.
  security find-generic-password -s "family-trip-planner/$1" -a "$USER" -w 2>/dev/null \
    || security find-generic-password -s "family-trip-planner/$1" -a "benbendod@gmail.com" -w 2>/dev/null \
    || true
}

ANTHROPIC=$(read_kc anthropic-api-key)
GEMINI=$(read_kc gemini-api-key)
SUPA_JWT=$(read_kc supabase-jwt-secret)
SUPA_SVC=$(read_kc supabase-service-key)
GCID=$(read_kc google-client-id)
GCSECRET=$(read_kc google-client-secret)

missing=()
[[ -z "$ANTHROPIC" ]] && missing+=("anthropic-api-key")
[[ -z "$GEMINI" ]]    && missing+=("gemini-api-key")
[[ -z "$SUPA_JWT" ]]  && missing+=("supabase-jwt-secret")
# The Gmail-broker keys are optional locally — if you don't run `wrangler dev`
# against the /api/gmail/* routes, no need to add them. Warn, don't fail.
if (( ${#missing[@]} )); then
  printf "Missing in Keychain: %s\nRun scripts/setup-keychain.sh first.\n" "${missing[*]}" >&2
  exit 1
fi
optional_missing=()
[[ -z "$SUPA_SVC" ]]  && optional_missing+=("supabase-service-key")
[[ -z "$GCID" ]]      && optional_missing+=("google-client-id")
[[ -z "$GCSECRET" ]]  && optional_missing+=("google-client-secret")
if (( ${#optional_missing[@]} )); then
  printf "Note: Gmail-broker keys missing (%s) — /api/gmail/* won't work locally.\n" "${optional_missing[*]}" >&2
fi

umask 077
{
  printf "ANTHROPIC_API_KEY=%s\n" "$ANTHROPIC"
  printf "GEMINI_API_KEY=%s\n" "$GEMINI"
  printf "SUPABASE_JWT_SECRET=%s\n" "$SUPA_JWT"
  [[ -n "$SUPA_SVC" ]]  && printf "SUPABASE_SERVICE_ROLE_KEY=%s\n" "$SUPA_SVC"
  [[ -n "$GCID" ]]      && printf "GOOGLE_CLIENT_ID=%s\n" "$GCID"
  [[ -n "$GCSECRET" ]]  && printf "GOOGLE_CLIENT_SECRET=%s\n" "$GCSECRET"
} > "$OUT"

printf "✔ wrote %s (mode 600)\n" "$OUT"
