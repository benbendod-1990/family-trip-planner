#!/usr/bin/env bash
# Push secrets from macOS Keychain to the Cloudflare Worker (production).
# Run once after setup-keychain.sh and any time a key rotates.
#
# Equivalent to running, for each key:
#   echo "$value" | wrangler secret put NAME
#
# Idempotent — overwrites if already set. wrangler must be authenticated
# (`./node_modules/.bin/wrangler whoami`).

set -euo pipefail

WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)/worker"
WRANGLER="$WORKER_DIR/node_modules/.bin/wrangler"
if [[ ! -x "$WRANGLER" ]]; then
  printf "wrangler not installed in worker/. Run: (cd worker && npm install)\n" >&2
  exit 1
fi

read_kc() {
  # Account-name convention drifted between adds: most keys use $USER, but
  # supabase-service-key was originally stored under the email. Try both.
  security find-generic-password -s "family-trip-planner/$1" -a "$USER" -w 2>/dev/null \
    || security find-generic-password -s "family-trip-planner/$1" -a "benbendod@gmail.com" -w 2>/dev/null \
    || true
}

# Pairs of <keychain-key>:<wrangler-secret-name>
PAIRS=(
  "anthropic-api-key:ANTHROPIC_API_KEY"
  "gemini-api-key:GEMINI_API_KEY"
  "supabase-jwt-secret:SUPABASE_JWT_SECRET"
  "supabase-service-key:SUPABASE_SERVICE_ROLE_KEY"
  "google-client-id:GOOGLE_CLIENT_ID"
  "google-client-secret:GOOGLE_CLIENT_SECRET"
)

cd "$WORKER_DIR"
for pair in "${PAIRS[@]}"; do
  kc_key="${pair%%:*}"
  secret_name="${pair##*:}"
  value=$(read_kc "$kc_key")
  if [[ -z "$value" ]]; then
    printf "✗ %-30s missing in Keychain — run scripts/setup-keychain.sh\n" "$kc_key"
    continue
  fi
  printf "→ pushing %s ... " "$secret_name"
  if printf "%s" "$value" | "$WRANGLER" secret put "$secret_name" >/tmp/wrangler-secret.log 2>&1; then
    printf "✔\n"
  else
    printf "✗ failed (see /tmp/wrangler-secret.log)\n"
  fi
done
