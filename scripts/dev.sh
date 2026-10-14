#!/usr/bin/env bash
# Local development: API server (5002), local test store (5004), dashboard (5003), storefront rebuilds.
# First time: PostgreSQL running, apps/server/.env filled (see apps/server/.env.example with CATALOG=dev),
# then `cd apps/server && npx prisma migrate deploy && npm run seed:dev`.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:storefront >/dev/null
trap 'kill 0' EXIT
(cd apps/storefront && npm run watch) &
(cd apps/server && npm run dev) &
(cd apps/devstore && npm run dev) &
(cd apps/dashboard && npm run dev) &
sleep 4
echo
echo "  Store      http://localhost:5004   (add a product to the cart)"
echo "  Dashboard  http://localhost:5003   (owner@local.test / local-password)"
echo "  API        http://localhost:5002"
wait
