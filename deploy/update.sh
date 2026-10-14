#!/usr/bin/env bash
# Brings the VPS copy of the checkout product to the newest code of its branch and restarts only
# its own apps (ShipTrack and every other app keep running). Needs no root: it runs as the
# `checkout` user (also how GitHub deploys: the deploy key can run only this script).
#   sudo bash /srv/checkout/app/deploy/update.sh      (or as the checkout user: bash .../update.sh)
set -euo pipefail
APP=/srv/checkout/app
ENV_FILE=/etc/checkout/checkout.env
ME=$(id -un)
[ "$ME" = root ] || [ "$ME" = checkout ] || { echo "run it with sudo (or as the checkout user)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "not installed yet: run deploy/install.sh first"; exit 1; }
# CHECKOUT_EXTRA_CA: only behind a TLS-inspecting proxy (never needed on a normal VPS).
EXTRA_CA="${CHECKOUT_EXTRA_CA:+export NODE_EXTRA_CA_CERTS=$CHECKOUT_EXTRA_CA GIT_SSL_CAINFO=$CHECKOUT_EXTRA_CA npm_config_cafile=$CHECKOUT_EXTRA_CA;}"
as_app() {
  if [ "$ME" = checkout ]; then bash -c "$EXTRA_CA export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh; $1"
  else sudo -u checkout -H bash -c "$EXTRA_CA export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh; $1"; fi
}
BRANCH=$(as_app "cd $APP && git rev-parse --abbrev-ref HEAD")
API_PORT=$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)
echo "== Code ($BRANCH)"
as_app "cd $APP && git fetch -q origin $BRANCH && git reset -q --hard origin/$BRANCH && git log -1 --oneline"
echo "== Packages, tables, build"
as_app "cd $APP && npm ci --no-audit --no-fund --loglevel=error"
as_app "cd $APP/apps/server && set -a && . $ENV_FILE && set +a && npx prisma generate >/dev/null && npx prisma migrate deploy"
as_app "cd $APP && npm run build:storefront >/dev/null && npm run build:checkout >/dev/null"
as_app "cd $APP/apps/dashboard && API_URL=http://127.0.0.1:$API_PORT npx next build >/dev/null"
echo "== Restart (only the checkout apps)"
as_app "cd $APP && pm2 startOrReload deploy/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null && pm2 ls"
sleep 3
curl -fsS "http://127.0.0.1:$API_PORT/health" && echo "  <- API answers"
