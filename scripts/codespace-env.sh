#!/usr/bin/env bash
# Writes apps/server/.env for this machine: the addresses the browser uses (Codespaces forwards
# each port to its own https URL) and random keys made here (never the live server's).
# In Codespaces the browser reaches our server THROUGH the store's address (the store passes
# /storefront, /checkout, /webhooks on), so only the store and dashboard ports are ever opened.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${CODESPACE_NAME:-}" ]; then
  url() { echo "https://${CODESPACE_NAME}-$1.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"; }
else
  url() { echo "http://localhost:$1"; }
fi
if [ -n "${CODESPACE_NAME:-}" ]; then PUBLIC=$(url 5004); else PUBLIC=$(url 5002); fi
key() { node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; }
ENV=apps/server/.env
# Keep the keys of an earlier run (the database holds data encrypted with them).
old() { [ -f "$ENV" ] && grep -E "^$1=" "$ENV" | head -1 | cut -d= -f2- || true; }
JWT=$(old JWT_SECRET); [ -n "$JWT" ] || JWT=$(key)
ENC=$(old ENCRYPTION_KEYS); [ -n "$ENC" ] || ENC="k1:$(key)"
PEP=$(old HASH_PEPPER); [ -n "$PEP" ] || PEP=$(key)
cat > "$ENV" <<ENVFILE
NODE_ENV=development
PORT=5002
PUBLIC_URL=$PUBLIC
DASHBOARD_URL=$(url 5003)
DATABASE_URL=postgresql://checkout:checkout@localhost:5432/checkout_dev
JWT_SECRET=$JWT
ENCRYPTION_KEYS=$ENC
HASH_PEPPER=$PEP
CATALOG=dev
DEV_CATALOG_FILE=../devstore/catalog.json
STOREFRONT_DIST=../storefront/dist/loader.js
CHECKOUT_DIST=../checkout/dist
OTP_SENDER=dev
DEV_GATEWAY=1
ORDER_SINK=dev
DEV_STORE_URL=$(url 5004)
DEV_STORE_INTERNAL_URL=http://localhost:5004
PINCODE_LOOKUP=dev
ENVFILE
echo "wrote $ENV for $(url 5004)"
