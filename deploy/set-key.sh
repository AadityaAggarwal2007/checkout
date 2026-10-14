#!/usr/bin/env bash
# Puts one setting into /etc/checkout/checkout.env WITHOUT showing the file or the value on screen
# (so a screenshot of the terminal never shows a secret). Then restart with deploy/update.sh.
#   sudo bash /srv/checkout/app/deploy/set-key.sh SHOPIFY_API_KEY
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/checkout/checkout.env}"
NAME="${1:-}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]{1,60}$ ]] || { echo "usage: sudo bash set-key.sh NAME   (e.g. SHOPIFY_API_KEY)"; exit 1; }
[ -w "$ENV_FILE" ] || { echo "cannot write $ENV_FILE: run it with sudo"; exit 1; }
read -rsp "Paste the value for $NAME (it stays hidden), then press Enter: " VALUE; echo
VALUE="${VALUE//$'\r'/}"
[ -n "$VALUE" ] || { echo "nothing pasted: $NAME not changed"; exit 1; }
[[ "$VALUE" != *$'\n'* ]] || { echo "the value has a line break: not saved"; exit 1; }
tmp=$(mktemp)
grep -v "^$NAME=" "$ENV_FILE" > "$tmp" || true
printf '%s=%s\n' "$NAME" "$VALUE" >> "$tmp"
cat "$tmp" > "$ENV_FILE" # keeps the file's owner and permissions
rm -f "$tmp"
echo "Saved $NAME (${#VALUE} characters). When all keys are in: sudo bash /srv/checkout/app/deploy/update.sh"
