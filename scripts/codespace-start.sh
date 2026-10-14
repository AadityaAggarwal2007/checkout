#!/usr/bin/env bash
# GitHub Codespaces, every start: database up, addresses refreshed, then everything runs in this
# terminal. The store's address also serves our script, checkout and gateway pages (passed on to
# the API), so the forwarded ports can stay private: only the owner's GitHub login opens them.
set -uo pipefail
cd "$(dirname "$0")/.."
sudo service postgresql start >/dev/null
bash scripts/codespace-env.sh >/dev/null
(cd apps/server && DATABASE_URL=postgresql://checkout:checkout@localhost:5432/checkout_dev npx tsx --env-file=.env scripts/seed-dev.ts >/dev/null)
if [ -n "${CODESPACE_NAME:-}" ]; then
  STORE="https://${CODESPACE_NAME}-5004.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  DASH="https://${CODESPACE_NAME}-5003.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  export STORE_PROXY_API=http://localhost:5002
else
  STORE=http://localhost:5004
  DASH=http://localhost:5003
fi
echo
echo "  Store      $STORE"
echo "  Dashboard  $DASH   (owner@local.test / local-password)"
echo
exec bash scripts/dev.sh
