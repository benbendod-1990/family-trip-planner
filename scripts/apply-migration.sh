#!/usr/bin/env bash
# Apply a SQL migration to the linked Supabase project via the Management API.
#
# Needs a personal access token (https://supabase.com/dashboard/account/tokens)
# in .env.supabase as SUPABASE_ACCESS_TOKEN=sbp_...  — that file is gitignored.
# The dashboard's SQL Editor does the same thing by hand; this exists so the
# migration is repeatable and reviewable rather than a one-off paste.
#
#   ./scripts/apply-migration.sh supabase/migrations/0006_trip_documents_storage.sql
set -euo pipefail

FILE="${1:?usage: apply-migration.sh <path-to.sql>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[ -f .env.supabase ] || { echo "missing .env.supabase (SUPABASE_ACCESS_TOKEN=sbp_...)" >&2; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env.supabase; set +a
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set in .env.supabase}"

# Derive the project ref from the URL the app actually ships with, so this can
# never be pointed at the wrong project by a stale constant.
URL="$(grep '^VITE_SUPABASE_URL' .env.production | cut -d= -f2- | tr -d '"'"'"' \r')"
REF="$(printf '%s' "$URL" | sed -E 's#https://([^.]+)\.supabase\.co/?#\1#')"
echo "project: $REF"
echo "applying: $FILE"

# The API takes the statements as one JSON string; jq -Rs handles the quoting
# and newlines that would otherwise mangle the SQL.
BODY="$(jq -Rs '{query: .}' < "$FILE")"
HTTP="$(curl -sS -o /tmp/supabase-migration-out.json -w '%{http_code}' \
  -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "$BODY")"

echo "HTTP $HTTP"
head -c 800 /tmp/supabase-migration-out.json; echo
[ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]
