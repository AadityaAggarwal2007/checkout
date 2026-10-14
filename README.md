# Checkout

Cart drawer + one-page checkout for Shopify stores (multi-store SaaS). Read `CLAUDE.md` first.

- `docs/PLAN.md` — research and every owner decision (FlexyPe inventory).
- `docs/DESIGN.md` — what we build: architecture, screens, database map, build order.

## Layout

| Path | What |
|---|---|
| `packages/core` | Pricing engine (coupons, shipping, COD / RTO, rewards). Pure, unit tested. |
| `packages/shared` | Settings schemas (zod) + API types shared by every app. |
| `apps/server` | Fastify API + Prisma (PostgreSQL): auth, stores, Shopify, drawer settings, storefront API. |
| `apps/storefront` | The script stores load: cart drawer in Shadow DOM + the checkout popup (15 KB gzip, budget 25 KB). |
| `apps/checkout` | The checkout page in the iframe: WhatsApp OTP, address, payment, thank-you (11 KB gzip, budget 45 KB). |
| `apps/dashboard` | Merchant dashboard (Next.js 14.2): login, overview, cart drawer editor, Orders, Shipping, Settings > Payments. |
| `apps/devstore` | A fake Shopify store for local work (product pages + the Shopify AJAX cart API). |
| `apps/shopify-app` | Shopify app config + the theme app embed (deployed with the Shopify CLI). |
| `e2e` | Playwright tests: real server + local store + dashboard in Chromium. |
| `server/`, `dashboard/`, `widget-src/` | The old ShopDrawer code, kept until the new apps replace it. |

## Try it in the browser

GitHub Codespaces runs everything with demo data: see `docs/TRY.md`.

## Run locally (no Shopify needed)

```bash
npm install
# PostgreSQL 16 running locally, a database checkout_dev, then:
cp apps/server/.env.example apps/server/.env   # fill JWT_SECRET, ENCRYPTION_KEYS, HASH_PEPPER; set CATALOG=dev
cd apps/server && npx prisma migrate deploy && npm run seed:dev && cd ../..
npm run dev
```

- Store: http://localhost:5004 — add a product to the cart, our drawer opens; **Checkout** opens our checkout.
  The WhatsApp code is printed by the API (`[dev-otp] … code 123456`); the test gateway has Pay / Fail buttons;
  orders "sent to Shopify" show at http://localhost:5004/dev-admin/orders.
- Dashboard: http://localhost:5003 — `owner@local.test` / `local-password`.
- Local `.env` for the checkout: `OTP_SENDER=dev`, `DEV_GATEWAY=1`, `ORDER_SINK=dev`, `PINCODE_LOOKUP=dev`
  (all refused in production).

## Checks (CI runs the same)

```bash
npm run typecheck
DATABASE_URL=postgresql://checkout:checkout@localhost:5432/checkout_test npm test
npm run e2e        # needs a checkout_e2e database; CHROME_PATH=... to use a local Chromium
```
