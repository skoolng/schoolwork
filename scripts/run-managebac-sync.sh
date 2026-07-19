#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
secret_file="${1:-$(cd "$script_dir/.." && pwd)/.secrets/managebac-sync.env}"

if [[ ! -f "$secret_file" ]]; then
  echo "ManageBac sync configuration was not found: $secret_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$secret_file"

: "${SYNC_URL:?SYNC_URL is required}"
: "${SYNC_SECRET:?SYNC_SECRET is required}"
: "${SIWC_BYPASS_TOKEN:?SIWC_BYPASS_TOKEN is required}"

/usr/bin/curl -fsS \
  -X POST \
  -H "x-sync-secret: $SYNC_SECRET" \
  -H "OAI-Sites-Authorization: Bearer $SIWC_BYPASS_TOKEN" \
  "$SYNC_URL"
