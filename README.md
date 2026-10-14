# Checkout

Cart drawer + one-page checkout for Shopify stores (multi-store SaaS). Read `CLAUDE.md` first.

- `docs/PLAN.md` — research and every owner decision (FlexyPe inventory).
- `docs/DESIGN.md` — what we build: architecture, screens, database map, build order.

## Layout

| Path | What |
|---|---|
| `packages/core` | Pricing engine (coupons, shipping, COD / RTO, rewards). Pure, unit tested. |
| `apps/server` | Fastify API + Prisma (PostgreSQL). |
| `server/`, `dashboard/`, `widget-src/` | The old ShopDrawer code, kept until the new apps replace it. |

## Run locally

```bash
npm install
# PostgreSQL 16 running locally, then:
cp apps/server/.env.example apps/server/.env   # fill JWT_SECRET, ENCRYPTION_KEYS, HASH_PEPPER (see comments)
cd apps/server && npx prisma migrate deploy && npm run dev
```

## Checks (CI runs the same)

```bash
npm run typecheck
DATABASE_URL=postgresql://checkout:checkout@localhost:5432/checkout_test npm test
```
