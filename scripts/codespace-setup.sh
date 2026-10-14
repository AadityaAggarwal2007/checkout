#!/usr/bin/env bash
# GitHub Codespaces, first start: PostgreSQL, packages, a local .env with fresh random keys,
# the database, the demo store. Demo data only — never real keys or customer data here.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== PostgreSQL"
if ! command -v psql >/dev/null; then
  sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
fi
sudo service postgresql start
sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='checkout'" | grep -q 1 || sudo -u postgres psql -qc "CREATE ROLE checkout LOGIN PASSWORD 'checkout' CREATEDB"
sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='checkout_dev'" | grep -q 1 || sudo -u postgres psql -qc "CREATE DATABASE checkout_dev OWNER checkout"

echo "== Packages"
npm ci --no-audit --no-fund

echo "== Settings (apps/server/.env)"
bash scripts/codespace-env.sh

echo "== Database + demo store"
cd apps/server
npx prisma generate >/dev/null
npx prisma migrate deploy
npx tsx --env-file=.env scripts/seed-dev.ts
cd ../..
npm run build:storefront >/dev/null
npm run build:checkout >/dev/null
echo "== Ready. The servers start by themselves (or run: bash scripts/codespace-start.sh)"
