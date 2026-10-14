#!/usr/bin/env bash
# Brings the VPS copy of the checkout product to the newest code of its branch and restarts only
# its own apps (ShipTrack and every other app keep running).   sudo bash /srv/checkout/app/deploy/update.sh
set -euo pipefail
APP=/srv/checkout/app
ENV_FILE=/etc/checkout/checkout.env
[ "$(id -u)" = 0 ] || { echo "run it with sudo"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "not installed yet: run deploy/install.sh first"; exit 1; }
as_app() { sudo -u checkout -H bash -lc "export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh; $1"; }
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
