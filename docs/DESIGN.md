# Checkout product — design (v1, 2026-10-14)

The build follows this file. `docs/PLAN.md` holds the research (FlexyPe inventory, owner answers); this file holds
what we build and how. Change this file first when a decision changes.

Working name in code: **`checkout`** (the brand name is a setting, decided later; never hard-code it).

## 1. Goals (owner)

- Conversion up: a cart drawer + 1-page checkout that is faster than Shopify's, with one-click for returning shoppers.
- COD down: prepaid offers, partial COD, COD rules (RTO suite), COD confirmation.
- Shopify fees down: the store's own payment gateway (PayGlocal, PayU in v1).
- Sold to outside stores: multi-store, every store fully separate, 1% of every successful order billed.
- Fast: the storefront script never slows the store; the checkout opens instantly.
- Easy to change: one feature = one module; texts / colours / rules come from settings, never hard-coded.

## 2. Non-negotiable rules

1. **Money is integer paise** everywhere (`Money = number` of paise, never floats in maths).
2. **The server decides every price.** Product prices are re-read from Shopify, discounts / shipping / COD fees
   are computed by `packages/core` on the server; the browser's numbers are display only.
3. **"Paid" only after the gateway confirms it** by a server-to-server status call (never trust a redirect or an
   unsigned callback). One checkout session creates at most one order (database unique key).
4. **A phone number alone reveals nothing.** Saved addresses / name / email only after WhatsApp OTP. No live launch
   without OTP.
5. **Every store is isolated.** Every table that holds store data carries `storeId`; every query filters by it.
6. **Secrets never in Git.** Gateway keys, Shopify tokens, WhatsApp tokens are stored encrypted (AES-256-GCM, key from
   env, key id for rotation); write-only in the dashboard (never sent back to the browser).
7. **A shipping charge is never labelled "Free"** (label comes from the amount; dashboard warns).
8. **One savings number** on a screen (or each one labelled), never two different "saved" figures unexplained.

## 3. Architecture

```
Shopify store (theme)                         Our server (VPS, separate app + database)
 ├─ theme app embed → loader.js  ───────────►  apps/server  (Fastify + Prisma + PostgreSQL)
 │    cart drawer (shadow DOM)                  ├─ /storefront/*  public API, widget key + CORS per store
 │    "Checkout" / "Buy it now"                 ├─ /checkout/*    checkout session API (iframe origin only)
 │      └─ opens iframe  ───────────────────►   ├─ /api/*         dashboard API (merchant login)
 │           apps/checkout (our origin)         ├─ /webhooks/*    Shopify, gateways (verified)
 │           desktop: centred popup             └─ jobs: abandoned checkouts, payment status poll, billing, cleanup
 │           phone: full screen                
 └─ gateway page (new tab on desktop, same tab on phone) → back to the iframe, which polls the session status

Merchant ─► apps/dashboard (Next.js 14.2) ─► /api/*
Shopify app: OAuth install + theme app embed + webhooks only. No settings inside Shopify admin (owner decision).
```

Why an iframe for the checkout: the store's own scripts (apps, trackers) cannot read the OTP, address or payment
step; our pages control their own CSP; one checkout code for every theme.

### Repository layout (npm workspaces, TypeScript everywhere)

```
packages/core        pure TS, no IO: money, cart, pricing engine (coupons, offers, gifts, B1G1, bundles),
                     shipping rates, COD / RTO decisions, partial COD, reward tiers, labels, validation.
                     Used by the server (authoritative) and the storefront (preview). 100% unit tested.
packages/shared      API types + zod schemas shared by server, dashboard, storefront, checkout.
apps/server          Fastify API, Prisma schema, gateways, Shopify, WhatsApp, jobs.
apps/dashboard       Next.js merchant dashboard.
apps/storefront      loader.js + cart drawer (vanilla TS, esbuild, target < 25 KB gzip).
apps/checkout        checkout page served in the iframe (vanilla TS + small view layer, esbuild).
apps/shopify-app     theme app extension (app embed block) + app config for the Shopify CLI.
```

The old `server/`, `dashboard/`, `widget-src/` stay until their replacement works, then are removed.

## 4. Merchant dashboard (screens)

Menu: Dashboard · Orders · Abandoned checkouts · Cart drawer · Checkout design · Coupons · Payment offers · Upsell ·
Shipping · RTO suite · Settings (Store, Payments, Integrations, API keys, Billing & usage, Users & permissions,
Activity log, Webhook log, Password). Store switcher top right. Every editor has a live preview next to it.

- **Dashboard:** net sales, AOV, revenue / visitor, orders, funnel (drawer open → checkout → login → address →
  payment → processing → order), sales by channel (UTM), payment-method share, coupon performance, exit-survey reasons.
- **Orders:** list (search, filters, export) + detail (items, discounts, shipping, transactions, attribution).
- **Abandoned checkouts:** list with the furthest step reached; detail.
- **Cart drawer:** sections Announcements, Reward bar, Upsells, Add-ons, Notes, Confirmation text, Discount codes,
  Trust badges (logo library), Free gifts (from coupons), Settings (pricing / variant selector / open on add / empty
  cart), colours. Several drawers per store, one active.
- **Checkout design:** General (logo, colours, mode standard / one-click, block order, exit flow, coupon layout,
  order-summary layout, quantity changer, compare-at, redirect-to-Shopify link, automatic coupons) and per step
  Login / Address / Payments (banners, button text, coupons, upsell, auto-scroll, trust badges, extra address line,
  GST section, COD confirmation, payment-method layout, list order / visibility / labels).
- **Coupons** (one engine, wizard Setup → Condition → Eligibility → Limits → Preview): amount off order / products,
  Buy X get Y, free gift, free shipping, bundle, purchase-driven. Code or automatic, can disable COD / partial COD.
- **Payment offers:** discount by payment method (all online modes or per mode).
- **Upsell:** rules WHEN (any / product / collection) → SHOW (products / collection), audience, extra discount,
  countdown timer; timer scope setting.
- **Shipping:** zones (states), rates by order price or weight, slabs with charge + COD allowed, blocked pincodes (CSV),
  ETA text.
- **RTO suite:** single rule / all rules (strictest wins); rules on cart amount, item count, past COD orders,
  new vs repeat, returns, user, pincode, state, product, collection; outcome = COD off / partial COD only / block.
- **Settings > Payments:** gateway cards (PayGlocal, PayU in v1) with write-only credentials, test / live, webhook
  checkbox; routing table method → gateway; COD and partial COD settings (fixed ₹ or %, set by the merchant).
- **Integrations (v1):** Meta Pixel.

## 5. Shopper flows

**Drawer:** add to cart (form, fetch, XHR intercepted) → drawer opens → rules preview live (reward bar, B1G1 grouping,
free gift lines, savings) → Checkout.
**Buy it now:** goes straight to the checkout with that one variant.
**Checkout (iframe):**
1. *Creating your order* → session created from the Shopify cart (prices re-read on the server).
2. *Login:* phone → WhatsApp OTP → verified (device remembered for that store; "Not you?" resets).
3. *Address:* saved addresses of that phone (only after OTP) or a new one (pincode → city / state autofill).
   One-click mode skips this step when a default address exists.
4. *Payments:* methods allowed after shipping + RTO + coupon rules; per-method price (prepaid offers); COD
   confirmation popup; partial COD shows "pay ₹x now, ₹y on delivery".
5. *Pay:* gateway page; the checkout polls; success → Shopify order created → thank-you; failure → retry.
Exit flow: leaving shows default / out-of-stock / savings reminder / survey (per settings).

### How the checkout works (Phase 2, as built)

- **Start:** the store page (`apps/storefront/src/checkout-frame.ts`) posts the cart's variant ids + quantities to
  `POST /storefront/checkout`; the server re-reads prices, creates a `CheckoutSession` and answers
  `/checkout/s/<id>#t=<token>` (the token is a signed JWT, purpose `checkout`, 24 h, kept in the URL fragment so no
  server log sees it). The store page also passes `&v=phone|desktop` (inside the popup the page cannot tell).
  Before the merchant switches the checkout on, it is used only on a store opened with the merchant's test link
  (`?ck_test=<key>`, key derived from the store id with the pepper, shown in Settings > Payments).
- **Login:** `POST /checkout/api/otp/send` (WhatsApp authentication template; 30 s between codes, 3 per number per
  10 min, 10 a day, 20 per IP an hour) → `/otp/verify` (5 tries, 5 min) → a device token (32 random bytes, stored
  as sha256, 60 days) kept in the iframe's localStorage, sent as `x-ck-device`. Personal data (phone, addresses)
  is in the state ONLY when that device token belongs to the session's shopper. "Not you?" revokes it.
- **Address:** saved addresses of this phone in this store, or a new one (validated, saved to the book; the first
  is the default). A remembered shopper's default address is chosen for them.
- **Pay:** each payment method row shows its own total (`priceByMethod`). Tapping one sends
  `{method, expectedTotal}`; prices are re-read fresh and a different total answers 409 `price_changed` with the
  new state. COD places the order at once. Online: a `PaymentTransaction` with a random ref (≤ 25 chars) and the
  frozen order draft; the shopper goes to `/checkout/go/<ref>` (desktop: a new tab opened inside the click; phone:
  the store page navigates) which posts / redirects to the gateway.
- **UPI inside the page (PayU):** for every UPI payment routed to a PayU account the server first asks PayU for a
  UPI intent server to server (`startUpiIntent`: the same `_payment` call and hash with `pg=UPI`, `bankcode=INTENT`,
  `txn_s2s_flow=4`, the shopper's IP and user agent, 8 s). The `upi://pay` link comes back in the pay answer and in
  `state.payment.upi` for 5 minutes; the checkout draws it as a QR (desktop, own encoder `apps/checkout/src/qr.ts`,
  no CDN) or as Open UPI app / GPay / PhonePe / Paytm buttons (phone). The transaction is the same PENDING row, so
  the poll, webhook and return page confirm it exactly as below. Any other answer (a page, an error, no link:
  PayU must enable "UPI Intent S2S" for the merchant id) falls back to the hosted page with nothing shown, and that
  account is not asked again for 6 hours (in memory, per account id + mode; a success clears it).
- **UPI inside the page (PayGlocal, live since 2026-10-15):** PayGlocal documents only PayCollect (hosted page) and
  card-only PayDirect, so `PayGlocalGateway.startUpiIntent` does what its hosted page does on "Generate QR", for
  the payment we just initiated: PayCollect initiate → take `x-gl-token` from the `redirectUrl` → `GET
  /gl/v2/payments/redirect/dc?x-gl-token=…` (page data; `indUpiPaynowUrl` sits a few levels down) → `POST
  <indUpiPaynowUrl>?x-gl-token=…` with `{customerCurrency:'INR', customerDeviceType:'WEB', upiData:{},
  agreedOnTnCs:false}`. The answer's `upiData` has `qrCode` (base64 PNG, read with jsqr + pngjs into the `upi://pay`
  link), `deepLink` (mobile flow only) and `timerSeconds` (900). Same checks and fallback as PayU (UPI pay link, our
  exact amount, token only sent to the page's PayGlocal host, 6 h pause on refusal). Undocumented on their side: if
  they change the page it falls back to the hosted page; the reason is in the log (`grep "payglocal upi-intent"`).
  Live keys must use Mode Live (test mode = UAT host = 401 with live keys). Requests carry only `x-gl-token-external`,
  exactly like PayGlocal's own payglocal-js-client.
- **Paid:** the return page, the gateway webhook and the iframe's polling all call `settle(ref)`: the gateway's
  status API decides (PayU `verify_payment`, PayGlocal status by gid); the amount must match. Then `createOrder`
  (one per session, unique key) → order number, coupon uses, shopper counters, `UsageCharge` 1%, then
  `orderCreate` in Shopify (failures kept on the order, retried every minute, button in the dashboard).
- **Back on the store:** desktop: the gateway tab tells the iframe and closes; phone: the thank-you page links to
  `store/#ck_done` (the loader empties the cart) or, after a failure, `#ck_resume=<token>` (reopens the checkout).
- **Local fakes** (refused when `NODE_ENV=production`): `OTP_SENDER=dev` (codes in the log and at
  `/checkout/dev/otp`), `DEV_GATEWAY=1` (Pay / Fail page), `ORDER_SINK=dev` (orders go to the local store,
  `/dev-admin/orders`), `PINCODE_LOOKUP=dev`.

## 6. Database (PostgreSQL, Prisma) — designed once, from the whole inventory

Conventions: `id` = cuid string; every store-owned table has `storeId` + index; money columns are `Int` paise;
`createdAt` / `updatedAt` everywhere; JSON only for settings blobs that are read and written whole (validated by zod).

| Area | Tables |
|---|---|
| Merchants | `User`, `Store`, `StoreMember` (role + permissions), `ApiKey`, `ActivityLog` |
| Shopify | `ShopifyConnection` (shop domain, encrypted token, scopes), `ShopifyWebhookEvent` (idempotency) |
| Settings | `DrawerConfig` (several per store, one active), `CheckoutConfig` (one per store), `StoreSettings` (COD, partial COD, timer scope, billing rate) |
| Rules | `Coupon` (+ `CouponRedemption`), `UpsellRule`, `RtoSettings`, `RtoRule` |
| Shipping | `ShippingZone`, `ShippingRate`, `ShippingSlab`, `BlockedPincode` |
| Payments | `GatewayAccount` (encrypted credentials), `PaymentRoute` (method → account), `PaymentTransaction`, `GatewayEvent` (raw callbacks, idempotency) |
| Shoppers | `Customer` (per store, by phone), `CustomerAddress`, `CustomerDevice` (remembered device, hashed token), `OtpChallenge` (hashed code, tries, expiry) |
| Checkout | `CheckoutSession` (cart + pricing snapshot, step reached, attribution, status), `Order`, `OrderLine` |
| Analytics | `AnalyticsEvent` (append-only), `ExitSurveyResponse`; daily roll-ups later |
| Billing | `UsageCharge` (one per order, 1% default), `Invoice` |
| Integrations | `Integration` (kind, encrypted config, enabled), `OutboundWebhookLog` |

The full schema lives in `apps/server/prisma/schema.prisma`; this table is its map.

## 7. Build order

| Phase | What | Done when |
|---|---|---|
| 0 | Monorepo, TS, `packages/core` (money, cart, pricing engine), full Prisma schema, encryption, auth, stores, Shopify OAuth (state + HMAC), tests + CI | ✅ 2026-10-14 |
| 1 | Storefront loader + drawer (port + TS), drawer config API + dashboard pages with live preview, theme app embed | ✅ 2026-10-14 on the local test store (a real Shopify dev store waits for the Partner account) |
| 2 | Checkout: session, shipping, address, WhatsApp OTP, PayGlocal + PayU (verified), COD / partial COD, Shopify order, thank-you | a real test order on a dev store, paid and COD — ✅ built and tested on localhost 2026-10-14 (fake WhatsApp / gateway / Shopify); the real test order waits for the owner's accounts (§8) |
| 3 | Coupon engine (all types + payment offers) in drawer and checkout, free gifts, B1G1, bundles | rule tests + same totals in drawer, checkout and Shopify order — ✅ 2026-10-14 (wizard for all 6 kinds + payment offers, list with stats, shopper coupon cards; totals tests per kind) |
| 4 | RTO suite, upsell rules + timer, exit flow, checkout design tabs with preview | ✅ 2026-10-14: RTO rules (10 kinds, all / top-rule mode) hide COD in the checkout; upsell offers on the payment step (WHEN any / products / collections → products, % off locked when added, timer from first view, audience, priority; SHOW = products, a collection is a later step); exit popup (savings reminder / message / survey with answer counts); Checkout design (logo URL, colours, step banners, method order / names / hiding, trust badges) with live preview |
| 5 | Dashboard home + funnel, orders, abandoned checkouts, Meta Pixel, logs, users, API keys | ✅ 2026-10-14: home (sales, orders, AOV, conversion, by day, funnel, payment mix, UTM sources, coupons, exit reasons; India days); abandoned checkouts (verified phone, no order, 30 min quiet) with a WhatsApp link the merchant opens; Meta Pixel (browser: AddToCart, InitiateCheckout, Purchase with value + order number as event id; Conversions API later); Settings tabs: Integrations, Team (people sign up first, admins cannot touch admins), API keys (owner only, shown once, read-only `GET /api/v1/orders`), Activity log |
| 6 | Billing (1%), go-live checklist, load test, security review | ✅ 2026-10-14 except Billing (owner: only his own team uses it for now; the 1% usage rows are still recorded, nothing is charged or shown): go-live checklist on the home page, security review + fixes (`docs/SECURITY.md`), load test script and result. Real go-live waits for the owner's WhatsApp / gateway / Shopify keys |

## 8. Needs from the owner (not blocking Phase 0-1)

- WhatsApp Business number + Meta app (Cloud API token, phone number id, an approved authentication template) — before
  Phase 2 testing.
- A Shopify Partner account (to create the app and push the theme app extension with the Shopify CLI) and a dev store.
- PayGlocal UAT and PayU test credentials (entered in the dashboard, never in chat).
- Subdomain DNS (e.g. `cart.shiptrack.store` already exists) and a database on the VPS (a new `checkout` database).
