# ShopDrawer → "FlexyPe jaisa" checkout — PLAN AND NOTES

Started 2026-10-14. This file is the memory of the planning. Every new session reads it first.

## Working rules (owner, 2026-10-14) — follow until he changes them

1. **Nothing gets built yet.** We are only collecting and saving. No code changes, no new
   features, until the owner says "ab banao".
2. **Save everything as it comes** (this file). Each FlexyPe screenshot the owner sends is written
   down below under "FlexyPe inventory": what the screen is, every field, toggle, option, default.
3. **The SQL / database design is done LAST**, after the whole inventory is complete, because a lot
   can still change. Goal: build it right in one go, not rebuild later.
4. After the screenshots are done the owner says "ho gaya"; then Claude compares the inventory with
   the current code (has / change / new) and asks its questions. Only then the build plan.
5. The owner writes Hinglish; answer in Hinglish, short and plain.
6. **Build so that everything is easy to build AND easy to change later** (owner 2026-10-14:
   "asa build kario jissa tuh sab kuch easily build aur change karla"): one feature per file /
   module, settings driven by config (no hard-coded texts, colours, rules), a new section or a new
   gateway added without touching the others.
7. **It must be fast** ("mujha fast chaia"): the storefront widget loads fast and never slows the
   Shopify store; the checkout feels instant; the dashboard is quick too.
8. **Screenshot order** (owner 2026-10-14): (a) FlexyPe merchant DASHBOARD first, (b) then the
   ADD TO CART / cart drawer setup, (c) then how it looks on the Shopify STOREFRONT.

## What the owner wants

- "Hume FlexyPe jaisa chahiye, sab kuch": the full FlexyPe product, its merchant dashboard and the
  add-to-cart / cart drawer / checkout the shopper sees.
- Goals (owner's answers 2026-10-14): **conversion badhana**, **COD kam karna**, **Shopify fees
  bachana**.
- For **outside stores too** (a SaaS for other merchants), not only our own.
- **Every store chooses its own payment gateway** (not one gateway for the whole server).
- Right now the checkout is **not live anywhere** (owner: "abhi band hai"), so there is no live
  customer to protect while it is rebuilt.

## What exists today (code on `main`, last commit 513997c, 2026-08-22)

Three parts, all build fine (checked 2026-10-09: widget build OK, dashboard `tsc` 0 errors,
server syntax + `prisma generate` OK):

- `server/` Express + Prisma + PostgreSQL, port 5002. Models: User, Store, StoreUser,
  DrawerConfig (one JSON column per section), Order.
- `widget-src/` vanilla JS, esbuild → `server/public/widget.js` (+ `preview.js` for the
  dashboard's live preview). Cart drawer: announcements, reward bar (milestone dots + confetti),
  cart items, coupons, upsells, free gifts, notes, trust badges, T&C confirmation; 3-step checkout
  (contact → address → payment), address autofill by phone, "use my location" (OpenStreetMap).
- `dashboard/` Next.js 14.1 (port 5003): login (register redirects to login), store selector,
  one page per section: announcements, reward bar, upsells, add-ons, notes, confirmation,
  discounts, trust badges, free gifts, settings, colors, post-purchase; overview with embed code.
- Payment: PayGlocal (JWE/JWS), keys from the server's `.env` and `server/keys/*.pem`, so ONE
  merchant only. SabPaisa code still present, unused. COD creates the Shopify order at once.
- After payment: hosted thank-you page `/api/order/<id>` or back to the store with
  `sd_order` / `sd_status`.
- Deploy notes: `deploy.sh` (fresh VPS), `ecosystem.config.js` (PM2 `drawer-server`,
  `drawer-dashboard`). Domain used in config: `cart.shiptrack.store`.

## Problems found in the current code (to fix in the rebuild, not now)

1. Payment callback trusts the token without checking it with PayGlocal: a forged callback can mark
   an order paid and create a paid Shopify order. `getTransactionStatus` exists but is never used.
   Also no protection against the same callback creating two Shopify orders.
2. `/api/widget/lookup-address` gives name, email and full address for a phone number alone (the
   widget key is public). Must become OTP-based.
3. Coupons: the drawer accepts the dashboard's own codes, the server only honours Shopify discount
   codes → shopper sees a discount and is charged the full amount.
4. Public repo carries the real PayGlocal merchant / key IDs (`server/.env.example`) and the server
   IP + a default DB password (`deploy.sh`).
5. Shopify OAuth callback does not check `state` and gives a new store to the FIRST user in the
   database. CORS is open to every origin with credentials.
6. Shopper's order note is never saved; Next.js 14.1.0 has a known security issue.
7. Gateway is global (env), not per store — blocks the "har store ka alag gateway" goal.

## Draft direction (before FlexyPe screenshots; will change)

- Phase 0 foundation: verified payments, no data leak, one coupon source, secrets out of repo.
- Phase 1 per-store gateways: one gateway interface, PayGlocal then PayU (to confirm), keys per
  store, encrypted, set in the dashboard.
- Phase 2 conversion: phone + OTP login, saved addresses, pincode → city/state.
- Phase 3 COD: prepaid discount, COD fee, COD OTP, block pincodes / high-RTO phones.
- Phase 4 funnel analytics + abandoned checkout (WhatsApp).
- Phase 5 SaaS: merchant signup, Shopify app, plans / billing.

## Open questions (asked 2026-10-14, not answered yet)

1. First test store before outside merchants (e.g. one of our own)?
2. SMS / OTP provider (MSG91, Fast2SMS, ...)? DLT template approval takes days.
3. Second gateway after PayGlocal: PayU, Razorpay, Cashfree?
4. Shopify app review / rules for selling to outside stores: check before Phase 5.

## FlexyPe inventory (filled from the owner's screenshots)

Format per screen: **Area > Screen** — what it does; every field / toggle / option with its
default; what the shopper sees because of it; notes for the database (kept for the END).

### (a) Dashboard

_(waiting for screenshots)_

### (b) Add to cart / cart drawer setup

_(later)_

### (c) On the Shopify storefront

_(later)_

## Database design

Not started on purpose (rule 3). Collect "notes for the database" in the inventory above; design
the whole schema once, at the end.
