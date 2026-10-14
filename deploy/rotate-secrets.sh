#!/usr/bin/env bash
# New database password, login (JWT) secret, hash pepper and encryption key for the checkout product,
# e.g. after checkout.env was shown on screen. Touches only the checkout database role and file.
# Everyone has to log in again; shoppers verify their phone again; the merchant test link changes.
#   sudo bash /srv/checkout/app/deploy/rotate-secrets.sh
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/checkout/checkout.env}"
APP=/srv/checkout/app
[ "$(id -u)" = 0 ] || { echo "run it with sudo"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found"; exit 1; }
gen() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }
set_var() { # NAME VALUE: replace the line (or add it), keeping the file's owner and permissions
  local tmp; tmp=$(mktemp)
  grep -v "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
ROLE=$(printf '%s' "$URL" | sed -E 's|^[a-z]+://([^:]+):.*|\1|')
DB=$(printf '%s' "$URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')
[ "$ROLE" = checkout_app ] || { echo "unexpected database role '$ROLE': stopping, nothing changed"; exit 1; }

# Values encrypted with the old key (Shopify tokens, gateway keys) are kept readable only if there are any.
ENCRYPTED=$(sudo -u postgres psql -d "$DB" -Atc "SELECT (SELECT count(*) FROM \"ShopifyConnection\" WHERE \"accessTokenEnc\" <> '') + (SELECT count(*) FROM \"GatewayAccount\" WHERE \"credentialsEnc\" <> '') + (SELECT count(*) FROM \"Integration\" WHERE \"secretEnc\" IS NOT NULL AND \"secretEnc\" <> '')")
OLD_KEYS=$(grep '^ENCRYPTION_KEYS=' "$ENV_FILE" | cut -d= -f2-)
NEW_ID="k$(date +%s)"
if [ "$ENCRYPTED" = 0 ]; then KEYS="$NEW_ID:$(gen)"; else KEYS="$NEW_ID:$(gen),$OLD_KEYS"; fi

PASS=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)
sudo -u postgres psql -qc "ALTER ROLE checkout_app PASSWORD '$PASS'"
set_var DATABASE_URL "$(printf '%s' "$URL" | sed -E "s|^([a-z]+://[^:]+:)[^@]*@|\1$PASS@|")"
set_var JWT_SECRET "$(gen)"
set_var HASH_PEPPER "$(gen)"
set_var ENCRYPTION_KEYS "$KEYS"
echo "New secrets saved (nothing printed). Encrypted values kept readable: $ENCRYPTED"
[ "$ENCRYPTED" = 0 ] || echo "Re-enter gateway / Shopify keys later so they move to the new key."
echo "Restarting the checkout apps…"
bash "$APP/deploy/update.sh" >/dev/null && echo "Done: log in again on the dashboard."
