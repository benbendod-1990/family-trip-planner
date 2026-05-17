#!/usr/bin/env bash
# Stores project secrets in macOS Keychain.
# Convention: service = "family-trip-planner/<key-name>", account = "$USER".
# Read back later with:  security find-generic-password -s "family-trip-planner/<key>" -w

set -euo pipefail

KEYS=(
  "anthropic-api-key|ANTHROPIC_API_KEY (sk-ant-...) — same one used in finance-dashboard"
  "gemini-api-key|GEMINI_API_KEY (AIza... from https://aistudio.google.com/app/api-keys)"
  "supabase-jwt-secret|SUPABASE_JWT_SECRET (Supabase → Settings → API → JWT Settings)"
  "supabase-service-key|SUPABASE_SERVICE_ROLE_KEY (NEW one, after rotating the leaked sb_secret_...)"
  "google-client-id|GOOGLE_CLIENT_ID (Google Cloud → Credentials → OAuth 2.0 — same client Supabase Auth uses)"
  "google-client-secret|GOOGLE_CLIENT_SECRET (paired with GOOGLE_CLIENT_ID — Worker uses it to refresh Gmail tokens)"
)

prompt_and_store() {
  local key="$1" desc="$2" service="family-trip-planner/$1"
  if security find-generic-password -s "$service" -a "$USER" >/dev/null 2>&1; then
    printf "✔ %-26s already in Keychain — skip (use --force to overwrite)\n" "$key"
    if [[ "${FORCE:-0}" != "1" ]]; then return; fi
  fi
  printf "Enter %s\n  > " "$desc"
  IFS= read -rs value
  echo
  if [[ -z "$value" ]]; then
    printf "  (empty — skipped)\n"
    return
  fi
  security add-generic-password -U -a "$USER" -s "$service" -w "$value"
  printf "✔ stored %s\n" "$service"
}

if [[ "${1:-}" == "--force" ]]; then export FORCE=1; fi

for entry in "${KEYS[@]}"; do
  IFS='|' read -r key desc <<<"$entry"
  prompt_and_store "$key" "$desc"
done

cat <<MSG

Done. Read a value back with, e.g.:
  security find-generic-password -s "family-trip-planner/anthropic-api-key" -w

To regenerate worker/.dev.vars from Keychain (for local \`wrangler dev\`), run:
  scripts/dev-vars-from-keychain.sh
MSG
