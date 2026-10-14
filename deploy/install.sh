#!/usr/bin/env bash
# Checkout product on a VPS, fully separate from anything else on it (ShipTrack keeps running as is).
#
#   sudo bash deploy/install.sh --domain checkout.example.com [--demo-domain demo-store.example.com]
#                               [--mode demo|live] [--branch claude/flexype-plan]
#
# What it creates (nothing else is touched):
#   Linux user   checkout            (own Node 20 via nvm, own PM2; no sudo rights)
#   code         /srv/checkout/app   (git clone of this repo)
#   secrets      /etc/checkout/checkout.env   (root:checkout, 640; made here, never in Git)
#   database     checkout  + role checkout_app (own password) on the existing PostgreSQL
#   ports        127.0.0.1:5202 API, :5203 dashboard, :5204 demo store (never public)
#   nginx        /etc/nginx/sites-available/checkout.conf (+ link), HTTPS by certbot when DNS points here
#   PM2 apps     checkout-api, checkout-dashboard, checkout-demo-store (service pm2-checkout)
#
# Safe to run again: it keeps the secrets, the database and the demo login; it refuses to take a
# domain that another nginx site already serves, or a port that another program uses.
set -euo pipefail

REPO_URL="${CHECKOUT_REPO:-https://github.com/AadityaAggarwal2007/checkout.git}"
BRANCH="claude/flexype-plan"
DOMAIN=""
DEMO_DOMAIN=""
MODE="demo"
APP_USER="checkout"
BASE="/srv/checkout"
APP="$BASE/app"
ETC="/etc/checkout"
ENV_FILE="$ETC/checkout.env"
DB_NAME="checkout"
DB_ROLE="checkout_app"
API_PORT=5202
DASH_PORT=5203
STORE_PORT=5204
NODE_MAJOR=20
SKIP_NGINX="${SKIP_NGINX:-0}"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --demo-domain) DEMO_DOMAIN="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) die "unknown option $1" ;;
  esac
done

[ "$(id -u)" = 0 ] || die "run it as root: sudo bash deploy/install.sh --domain ..."
valid_domain() { [[ "$1" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; }
valid_domain "$DOMAIN" || die "give the domain: --domain checkout.yourdomain.com"
[ -z "$DEMO_DOMAIN" ] || valid_domain "$DEMO_DOMAIN" || die "--demo-domain is not a domain"
[ "$MODE" = demo ] || [ "$MODE" = live ] || die "--mode is demo or live"
[ "$MODE" = live ] && DEMO_DOMAIN=""
[ "$MODE" = live ] || [ -n "$DEMO_DOMAIN" ] || die "demo mode needs a second address for the demo store: --demo-domain demo-store.yourdomain.com"
FIRST_RUN=0
[ -f "$ENV_FILE" ] || FIRST_RUN=1

# ------------------------------------------------------------------ safety checks
say "Checking that nothing else is disturbed"
if command -v ss >/dev/null; then
  for port in $API_PORT $DASH_PORT $STORE_PORT; do
    pid=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)
    [ -z "$pid" ] && continue
    user=$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ')
    [ "$user" = "$APP_USER" ] || die "port $port is used by another program (pid $pid, user $user). Nothing was changed."
  done
fi
if [ "$SKIP_NGINX" != 1 ] && [ -d /etc/nginx ]; then
  for d in $DOMAIN $DEMO_DOMAIN; do
    other=$(grep -rlsw "server_name.*$d" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -v '/checkout.conf$' || true)
    [ -z "$other" ] || die "$d is already served by another nginx site ($other). Use another subdomain."
  done
fi
command -v psql >/dev/null || die "PostgreSQL is not installed on this server (this script uses the existing one)."
sudo -u postgres psql -qtAc 'SELECT 1' >/dev/null || die "cannot reach PostgreSQL as the postgres user."

# ------------------------------------------------------------------ packages
say "System packages (git, curl, ca-certificates)"
need=""
for p in git curl; do command -v "$p" >/dev/null || need="$need $p"; done
if [ -n "$need" ]; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $need ca-certificates; fi

# ------------------------------------------------------------------ user + node
say "Linux user '$APP_USER' with its own Node $NODE_MAJOR and PM2"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$BASE" && chown "$APP_USER:$APP_USER" "$BASE"
# CHECKOUT_EXTRA_CA: only behind a TLS-inspecting proxy (never needed on a normal VPS).
EXTRA_CA="${CHECKOUT_EXTRA_CA:+export NODE_EXTRA_CA_CERTS=$CHECKOUT_EXTRA_CA GIT_SSL_CAINFO=$CHECKOUT_EXTRA_CA npm_config_cafile=$CHECKOUT_EXTRA_CA;}"
as_app() { sudo -u "$APP_USER" -H bash -c "$EXTRA_CA export NVM_DIR=\$HOME/.nvm; [ -s \$NVM_DIR/nvm.sh ] && . \$NVM_DIR/nvm.sh; cd ~; $1"; }
if ! as_app 'command -v nvm' >/dev/null 2>&1; then
  as_app 'mkdir -p "$NVM_DIR" && curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | PROFILE=/dev/null bash >/dev/null'
fi
as_app "nvm install $NODE_MAJOR >/dev/null && nvm alias default $NODE_MAJOR >/dev/null && node -v"
as_app 'command -v pm2 >/dev/null || npm install -g pm2@5.4.3 --no-audit --no-fund >/dev/null'
NODE_BIN=$(as_app 'dirname "$(command -v node)"')

# ------------------------------------------------------------------ code
say "Code in $APP (branch $BRANCH)"
if [ -d "$APP/.git" ]; then
  as_app "cd $APP && git fetch -q origin $BRANCH && git checkout -q $BRANCH && git reset -q --hard origin/$BRANCH"
else
  as_app "git clone -q --branch $BRANCH $REPO_URL $APP"
fi
as_app "cd $APP && git log -1 --oneline"

# ------------------------------------------------------------------ database
say "Database '$DB_NAME' (separate from every other database here)"
mkdir -p "$ETC"
gen() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }
if [ "$FIRST_RUN" = 1 ]; then
  DB_PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)
else
  DB_PASS=$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
fi
if sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_ROLE'" | grep -q 1; then
  [ "$FIRST_RUN" = 0 ] || sudo -u postgres psql -qc "ALTER ROLE $DB_ROLE LOGIN PASSWORD '$DB_PASS'"
else
  sudo -u postgres psql -qc "CREATE ROLE $DB_ROLE LOGIN PASSWORD '$DB_PASS'"
fi
sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres psql -qc "CREATE DATABASE $DB_NAME OWNER $DB_ROLE"
sudo -u postgres psql -qc "REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC"

# ------------------------------------------------------------------ settings
say "Settings in $ENV_FILE"
if [ "$FIRST_RUN" = 1 ]; then
  if [ "$MODE" = demo ]; then
    STORE_URL="https://$DEMO_DOMAIN"
    MODE_LINES="NODE_ENV=development
CATALOG=dev
DEV_CATALOG_FILE=../devstore/catalog.json
OTP_SENDER=dev
DEV_GATEWAY=1
ORDER_SINK=dev
DEV_STORE_URL=$STORE_URL
DEV_STORE_INTERNAL_URL=http://127.0.0.1:$STORE_PORT
PINCODE_LOOKUP=india_post"
  else
    MODE_LINES="NODE_ENV=production
CATALOG=shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
OTP_SENDER=whatsapp
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_OTP_TEMPLATE=
WHATSAPP_TEMPLATE_LANG=en
DEV_GATEWAY=0
ORDER_SINK=shopify
PINCODE_LOOKUP=india_post"
  fi
  umask 027
  cat > "$ENV_FILE" <<ENVFILE
# Checkout product — made by deploy/install.sh on $(date -u +%F). Secrets: never copy into Git or chat.
CHECKOUT_MODE=$MODE
PORT=$API_PORT
DASHBOARD_PORT=$DASH_PORT
DEMO_STORE_PORT=$STORE_PORT
PUBLIC_URL=https://$DOMAIN
DASHBOARD_URL=https://$DOMAIN
DATABASE_URL=postgresql://$DB_ROLE:$DB_PASS@127.0.0.1:5432/$DB_NAME
JWT_SECRET=$(gen)
ENCRYPTION_KEYS=k1:$(gen)
HASH_PEPPER=$(gen)
STOREFRONT_DIST=../storefront/dist/loader.js
CHECKOUT_DIST=../checkout/dist
$MODE_LINES
ENVFILE
  umask 022
else
  echo "kept the existing settings (edit $ENV_FILE by hand to change them)"
fi
chown root:"$APP_USER" "$ETC" "$ENV_FILE" && chmod 750 "$ETC" && chmod 640 "$ENV_FILE"
MODE=$(grep '^CHECKOUT_MODE=' "$ENV_FILE" | cut -d= -f2)

# ------------------------------------------------------------------ build
say "Packages, database tables, build (a few minutes)"
as_app "cd $APP && npm ci --no-audit --no-fund --loglevel=error"
as_app "cd $APP/apps/server && set -a && . $ENV_FILE && set +a && npx prisma generate >/dev/null && npx prisma migrate deploy"
as_app "cd $APP && npm run build:storefront >/dev/null && npm run build:checkout >/dev/null"
as_app "cd $APP/apps/dashboard && API_URL=http://127.0.0.1:$API_PORT npx next build >/dev/null"

if [ "$MODE" = demo ] && [ ! -f "$ETC/demo-login.txt" ]; then
  say "Demo store and its own login"
  DEMO_PASS=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)
  as_app "cd $APP/apps/server && set -a && . $ENV_FILE && set +a && DEMO_OWNER_EMAIL=owner@demo.checkout DEMO_OWNER_PASSWORD='$DEMO_PASS' npx tsx scripts/seed-dev.ts >/dev/null"
  umask 077
  printf 'Dashboard https://%s\nlogin    owner@demo.checkout\npassword %s\n' "$DOMAIN" "$DEMO_PASS" > "$ETC/demo-login.txt"
  umask 022
fi

# ------------------------------------------------------------------ run
say "Starting the apps (PM2 of user $APP_USER)"
as_app "cd $APP && pm2 startOrReload deploy/ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null && pm2 ls"
if [ -d /run/systemd/system ]; then
  env PATH="$PATH:$NODE_BIN" "$NODE_BIN/pm2" startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null && echo "starts again by itself after a reboot (service pm2-$APP_USER)"
fi

# ------------------------------------------------------------------ deploy key for GitHub
# A key that can do ONE thing: log in as `checkout` and run deploy/update.sh (forced command,
# no shell, no forwarding). Its private half goes into the repo's GitHub secret VPS_SSH_KEY.
DEPLOY_KEY="$ETC/deploy_key"
NEW_KEY=0
if [ ! -f "$DEPLOY_KEY" ]; then
  ssh-keygen -q -t ed25519 -N '' -C "checkout-deploy@$(hostname)" -f "$DEPLOY_KEY"
  chmod 600 "$DEPLOY_KEY"
  NEW_KEY=1
fi
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
AUTH="/home/$APP_USER/.ssh/authorized_keys"
touch "$AUTH" && chown "$APP_USER:$APP_USER" "$AUTH" && chmod 600 "$AUTH"
grep -q "checkout-deploy@" "$AUTH" || echo "command=\"/bin/bash $APP/deploy/update.sh\",restrict $(cat "$DEPLOY_KEY.pub")" >> "$AUTH"

# ------------------------------------------------------------------ nginx + https
if [ "$SKIP_NGINX" = 1 ] || ! command -v nginx >/dev/null; then
  say "nginx not found / skipped: the apps run on 127.0.0.1 only"
else
  say "nginx site for $DOMAIN ${DEMO_DOMAIN:+and $DEMO_DOMAIN}"
  CONF=/etc/nginx/sites-available/checkout.conf
  if [ ! -f "$CONF" ] || ! grep -q 'ssl_certificate' "$CONF"; then
    {
      cat <<NGINX
# Checkout product (deploy/install.sh). Only this file belongs to it.
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 2m;
    location ~ ^/(api|storefront|checkout|webhooks|health)(/|\$) {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:$DASH_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
      if [ -n "$DEMO_DOMAIN" ]; then
        cat <<NGINX
server {
    listen 80;
    server_name $DEMO_DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$STORE_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX
      fi
    } > "$CONF"
  fi
  ln -sf "$CONF" /etc/nginx/sites-enabled/checkout.conf
  if ! nginx -t 2>/tmp/checkout-nginx.txt; then
    rm -f /etc/nginx/sites-enabled/checkout.conf
    cat /tmp/checkout-nginx.txt
    die "nginx did not accept the new site, so it was switched off again (other sites untouched)."
  fi
  systemctl reload nginx 2>/dev/null || nginx -s reload
  if command -v certbot >/dev/null; then
    certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect \
      -d "$DOMAIN" ${DEMO_DOMAIN:+-d "$DEMO_DOMAIN"} >/dev/null 2>&1 \
      && echo "HTTPS on" \
      || echo "!! HTTPS not set yet: point the DNS of $DOMAIN ${DEMO_DOMAIN:+and $DEMO_DOMAIN} to this server, then run this script again."
  else
    echo "!! certbot is not installed: apt-get install -y certbot python3-certbot-nginx, then run this script again."
  fi
fi

# ------------------------------------------------------------------ done
say "Done"
echo "Dashboard     https://$DOMAIN"
[ -z "$DEMO_DOMAIN" ] || echo "Demo store    https://$DEMO_DOMAIN"
[ ! -f "$ETC/demo-login.txt" ] || echo "Demo login    sudo cat $ETC/demo-login.txt"
[ "$MODE" = live ] && echo "Live mode: fill the empty keys in $ENV_FILE (sudo nano $ENV_FILE), then: sudo bash $APP/deploy/update.sh"
echo "Logs          sudo -u $APP_USER -H bash -c '. ~/.nvm/nvm.sh && pm2 logs --lines 50 --nostream'"
echo "Update later  sudo bash $APP/deploy/update.sh"
if [ "$NEW_KEY" = 1 ] || [ "${SHOW_DEPLOY_KEY:-0}" = 1 ]; then
  say "For automatic updates from GitHub (once)"
  echo "GitHub → checkout repo → Settings → Secrets and variables → Actions → New repository secret:"
  echo "  VPS_HOST     = $(curl -fsS -4 -m 5 https://api.ipify.org 2>/dev/null || echo '<this server IP>')"
  echo "  VPS_SSH_KEY  = everything between the two lines below (it can only update the checkout app):"
  echo "------------------------------------------------------------"
  cat "$DEPLOY_KEY"
  echo "------------------------------------------------------------"
  echo "(Show it again later: sudo cat $DEPLOY_KEY)"
fi
