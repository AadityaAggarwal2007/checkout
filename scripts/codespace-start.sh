#!/usr/bin/env bash
# GitHub Codespaces, every start: database up, addresses refreshed, ports public (the store page
# loads our script and checkout from the API port, so the browser must reach it without a GitHub
# login), then everything runs in this terminal (WhatsApp codes also show here).
set -uo pipefail
cd "$(dirname "$0")/.."
sudo service postgresql start >/dev/null
bash scripts/codespace-env.sh >/dev/null
(cd apps/server && DATABASE_URL=postgresql://checkout:checkout@localhost:5432/checkout_dev npx tsx --env-file=.env scripts/seed-dev.ts >/dev/null)
if [ -n "${CODESPACE_NAME:-}" ]; then
  if gh codespace ports visibility 5002:public 5003:public 5004:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    echo "Ports 5002, 5003, 5004 are public."
  else
    echo "!! Make the ports public once: PORTS tab -> right-click 5002, 5003, 5004 -> Port Visibility -> Public"
  fi
  STORE="https://${CODESPACE_NAME}-5004.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  DASH="https://${CODESPACE_NAME}-5003.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  export STORE_API_URL="https://${CODESPACE_NAME}-5002.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  STORE=http://localhost:5004
  DASH=http://localhost:5003
fi
echo
echo "  Store      $STORE"
echo "  Dashboard  $DASH   (owner@local.test / local-password)"
echo
exec bash scripts/dev.sh
