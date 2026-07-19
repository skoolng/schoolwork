#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <site-sync-url> <sync-secret> <sites-bypass-token>"
  echo "Example: $0 https://example.site/api/sync 'sync-secret' 'bypass-token'"
  exit 1
fi

sync_url="$1"
sync_secret="$2"
sites_bypass_token="$3"
marker="advika-managebac-sync"
tmp_file="$(mktemp)"
script_dir="$(cd "$(dirname "$0")" && pwd)"
secret_dir="$(cd "$script_dir/.." && pwd)/.secrets"
secret_file="$secret_dir/managebac-sync.env"
runner="$script_dir/run-managebac-sync.sh"

umask 077
mkdir -p "$secret_dir"
printf 'SYNC_URL=%q\nSYNC_SECRET=%q\nSIWC_BYPASS_TOKEN=%q\n' \
  "$sync_url" \
  "$sync_secret" \
  "$sites_bypass_token" > "$secret_file"
chmod 600 "$secret_file"

crontab -l 2>/dev/null | grep -v "$marker" > "$tmp_file" || true

schedule_config="${MANAGEBAC_CRON_SCHEDULES:-${MANAGEBAC_CRON_SCHEDULE:-}}"
if [[ -n "$schedule_config" ]]; then
  IFS=';' read -r -a schedules <<< "$schedule_config"
else
  schedules=("0 15 * * 1-5" "30 16 * * 1-5")
fi

for schedule in "${schedules[@]}"; do
  printf '%s %q %q >/tmp/%s.log 2>&1 # %s\n' \
    "$schedule" \
    "$runner" \
    "$secret_file" \
    "$marker" \
    "$marker" >> "$tmp_file"
done
crontab "$tmp_file"
rm -f "$tmp_file"

printf 'Installed ManageBac sync cron entries:\n'
printf '  %s\n' "${schedules[@]}"
