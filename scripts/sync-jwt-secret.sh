#!/usr/bin/env bash
# One-shot helper: prompt for the Supabase JWT Secret (masked input),
# store it in macOS Keychain, then push it to the deployed Cloudflare Worker.

set -euo pipefail

cd "$(dirname "$0")/.."

SERVICE="family-trip-planner/supabase-jwt-secret"

printf "Paste Supabase JWT Secret (Settings → API → JWT Settings)\n  > "
IFS= read -rs value
echo
if [[ -z "$value" ]]; then
  echo "Empty, aborting." >&2
  exit 1
fi

# Save to Keychain (so future deploys / wrangler dev can read it back).
security add-generic-password -U -a "$USER" -s "$SERVICE" -w "$value"
printf "✔ stored in Keychain (%s)\n" "$SERVICE"

# Push to Cloudflare Worker as the SUPABASE_JWT_SECRET secret.
( cd worker && printf "%s" "$value" | npx wrangler secret put SUPABASE_JWT_SECRET )
printf "✔ pushed to worker\n"
