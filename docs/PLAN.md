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

## Build progress

- 2026-10-14 Phase 0 started: `docs/DESIGN.md`, `packages/core` (pricing engine, 33 tests), full Prisma schema
  (36 tables, first migration), `apps/server` (env, encryption keyring, merchant login, store access, Shopify OAuth
  with state + HMAC, webhooks incl. privacy topics; 20 tests on a real PostgreSQL), CI workflow.
- 2026-10-14 Phase 1 done (owner: "local pa host kardio"): cart drawer on the store (Shadow DOM, 13 KB gzip,
  add-to-cart capture, B1G1 groups, free-gift lines, coupons sheet, upsells, reward bar, notes, terms,
  trust badges, theme cart count), public storefront API (prices from the catalog, never the browser),
  dashboard (login/signup, store overview, drawers list, editor with live preview, product picker),
  theme app embed + Shopify app config, a local fake Shopify store, 66 unit/API tests + 5 Playwright
  end-to-end tests, CI runs all of it. Everything runs on localhost; no domain needed yet.
- 2026-10-14 Phase 2 built on localhost (owner: "start kr 2"): our checkout in an iframe (desktop popup, phone
  full screen) opened from the drawer, the theme cart page and "Buy it now"; WhatsApp OTP login (hashed codes,
  limits, remembered device, "Not you?"), saved addresses only after OTP, pincode autofill, coupons, price per
  payment method, COD with confirmation popup, partial COD, PayU + PayGlocal adapters (paid only after the
  gateway's server-to-server check), a local test gateway, orders (own number CK1001…, 1% usage charge, copy to
  Shopify with retries), dashboard Settings > Payments, Shipping editor, Orders list + detail. 62 server tests,
  9 shared tests, 10 Playwright tests. Waiting for the owner: WhatsApp Business (Cloud API token, phone number
  id, approved OTP template), PayU test key + salt, PayGlocal UAT keys, Shopify Partner app + dev store — then
  the "real test order" of Phase 2 can be done.

- 2026-10-14 Phase 3 done: coupon wizard (Setup › Condition › Eligibility › Limits › Preview, live summary and
  shopper card) for amount off, Buy X get Y, purchase driven, free gift, free shipping, bundle; payment offers per
  method; list with orders / gross / discount / net, visibility, active, bulk; coupon cards in the drawer.
- 2026-10-14 Phase 4 done: RTO suite, upsell with % off and a timer in the checkout, exit popup / survey,
  Checkout design page with live preview.
- 2026-10-14 Phase 5 done: dashboard home numbers + funnel, abandoned checkouts, Meta Pixel, team, API keys,
  activity log.
- 2026-10-14 Owner: no Billing for now ("abhi sirf team ko chaia"): the checkout is for his own team first.
  Phase 6 done without it: go-live checklist, security review + fixes, load test.
- 2026-10-14 Owner: the checkout goes on **merchantbuild.in** (demo store on demo.merchantbuild.in); Shopify Builder
  steps aside there (only its nginx link is removed; app, code, database kept; `deploy/restore-site.sh` undoes it).
  VPS install: `docs/VPS.md`, `deploy/install.sh`; updates by GitHub "Deploy to VPS" with a key that can only run
  `deploy/update.sh`.

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

## Owner's answers after the dashboard screenshots (2026-10-14)

1. **Brand name:** decide later. Keep it a setting / placeholder ("Powered by ___"), never hard-coded.
2. **Billing of merchants:** a **percentage of every successful order**. Needs: per-store rate, a usage ledger per
   order, "Outstanding payable" like FlexyPe's card, invoices later.
3. **Gateways in the first version:** **PayGlocal and PayU** (others later through the same gateway interface).
4. **Login OTP:** ~~no OTP for now~~ — CHANGED, see decision 4 below (WhatsApp OTP, required before going live). Consequence (Claude): without OTP the server must NOT return saved addresses
   for a typed phone number (today's leak). Saved address can only come from the same shopper's own browser
   (remembered on that device). "One-Click Checkout" across devices waits for OTP.
5. **One place for the merchant** (owner 2026-10-14): OUR dashboard holds everything (cart drawer AND checkout:
   coupons, payments, RTO, analytics). The Shopify app only installs (OAuth), turns the drawer on through the theme
   app embed, and links to our dashboard. No settings inside Shopify admin.

## Owner's answers after all screenshots (2026-10-14)

1. **Partial COD:** the merchant sets it per store (fixed ₹ OR % of the order paid up front; rest on delivery).
2. **Shipping rates:** ONLY in our dashboard (no Shopify shipping sync). Merchant builds zones / rates / price or weight
   slabs / COD per slab / blocked pincodes there.
3. **Integrations in v1:** **Meta Pixel** only (checkout started, add payment info, purchase events). Others later.
4. **Billing:** **1% of every successful order** (paid, or COD confirmed). Cancelled / failed / refunded orders are not
   charged. Rate stored per store so it can change later.

## Decisions 2026-10-14 (after the screenshots)

1. **Server:** the ShipTrack Hostinger VPS, as a separate app with its own database (domain like cart.shiptrack.store).
2. **Next step:** Claude writes the FULL DESIGN first (screens, flows, database tables, build order); the owner approves;
   only then code.
3. **Address by phone number:** the owner has a video of FlexyPe's mobile flow where the saved address is fetched from the
   customer's phone number. OPEN: how to do this without the privacy leak (problem 2). Claude's position: a phone number
   alone must never show someone's address; it needs a check that the shopper owns the number (OTP by WhatsApp / SMS, or
   masked address until verified). Waiting for the video and the owner's call.

4. **OTP on WhatsApp, required before going live** (owner 2026-10-14: "otp daldenge bhai, uska bina live nai karanga,
   whatsapp pa bhejde bass"). Flow: shopper types the phone → a 4-6 digit OTP goes by WhatsApp (Cloud API template) →
   only after the right OTP the saved addresses / name / email of THAT phone appear (one-click checkout). Never any
   address, name or email for an unverified number. Limits on sends and wrong tries per phone and per IP; the code
   expires in a few minutes; it is stored hashed. The verified device is remembered (signed cookie) so a returning shopper
   on the same phone skips the OTP, like FlexyPe's "Not you?". Needs: a WhatsApp Business number + an approved
   authentication template (Meta), env vars for the token / phone ID / template. Problem 2 is closed by this.

## Design rules decided while reading FlexyPe (keep when building)

1. **A shipping charge is never shown under a "Free" name** (owner 2026-10-14, from FlexyPe order #2246: the rate was
   named "Free shipping" but its ₹0-199 slab charged ₹30). The label the shopper sees comes from the AMOUNT, not
   the rate's name: ₹0 → "Free shipping"; more than ₹0 → "Shipping ₹30" (and, when a free slab exists above, a line
   "Add ₹x more for free shipping"). The dashboard warns when a rate whose name contains "free" has a slab above ₹0.
   Same on the order page, the thank-you page and the order emails.

## Open questions (asked 2026-10-14, not answered yet)

1. First test store before outside merchants (e.g. one of our own)?
2. ~~SMS / OTP provider~~ answered: WhatsApp only (owner gives WhatsApp Business).
3. ~~Second gateway~~ answered: PayGlocal + PayU in v1.
4. Shopify app review / rules for selling to outside stores: check before Phase 5.

## FlexyPe inventory (filled from the owner's screenshots)

Format per screen: **Area > Screen** — what it does; every field / toggle / option with its
default; what the shopper sees because of it; notes for the database (kept for the END).

### (a) Dashboard

Source: 67 screenshots of the owner's FlexyPe merchant dashboard (store "Kurtiya Store", gateway PayGlocal),
taken 2026-10-14 11:56-12:03. Notes keep STRUCTURE only: no customer, merchant or key data copied.
Numbers below = screenshot order (01-67).

**Menu:** Dashboard · Orders · Abandoned Checkouts · Shipping · Coupons · Payment Offers · Upsell · Customization ·
RTO Suite · Settings (Store Details, Payments, Taxes & Duties, Integrations, API Keys, Billing & Usage,
Users & Permissions, Activity Logs, Webhook Logs, Change Password). Header: notifications bell, store switcher.

**Big ideas worth copying**
- Every setting has a LIVE mobile preview of the checkout next to it (Customization).
- Checkout = 3 steps Login (phone) → Address (saved addresses) → Payments; each step has its own banners, coupons,
  upsell, button text. "One-Click Checkout" mode skips the address step for known customers.
- Coupons are one engine with 6 types and a 5-step wizard (Setup, Condition, User eligibility, Usage limits, Preview)
  with a live summary; a coupon can switch off COD / Partial COD (this is how "Prepaid 5%" works) and is shown
  as a card with auto-written details.
- Payment: many gateways per store, and a routing table "which gateway handles UPI / cards / EMI / wallets /
  pay later / netbanking"; COD, Partial COD, EMI providers (Snapmint, Velocity) as methods; each method can be
  hidden, renamed, reordered; the UPI card shows the discounted price.
- RTO Suite: rules that switch COD / Partial COD off by cart amount, item count, past COD orders, new vs repeat,
  returns history, user, pincode, state, product, collection; "all rules together, strictest wins".
- Upsell rules: WHEN (any product / collection / product) → SHOW (products / collection), audience, extra
  discount, countdown timer.
- Analytics: funnel Checkout → Login → Address → Payment → Processing → Orders, sales by channel (UTM),
  payment-method share, discount performance, exit survey reasons; abandoned checkouts with the step reached.

**Screen by screen**

```text
Store shown: "Kurtiya Store" (our own kurtiya uses FlexyPe now). Gateway PayGlocal. Taken 2026-10-14 11:56-12:03.

01 Dashboard (dashboard.flexype.io/dashboard). Left menu: Dashboard, Orders, Abandoned Checkouts, Shipping, Coupons,
   Payment Offers, Upsell (NEW), Customization, RTO Suite (NEW), Settings. Bottom-left: red "Outstanding Payable ₹x" card
   (clear dues banner, link), "View Store". Top-right: bell (notifications), store switcher "Kurtiya Store". Date range picker.
   Cards: Net Sales (₹ + line chart, compare to previous period), Average Order Value (+sparkline), Revenue per visitor,
   Total Orders (+sparkline), Average Session Duration. Sales Conversion Funnel: Checkout → Login → Address → Payment →
   Processing → Orders, counts + % (+ "Get report"). Discount performance: With coupons (conversion %, orders, sessions)
   vs Without coupons; overall % up/down.
02 Dashboard cont.: Sales Channels table (Facebook, Google, Instagram, Youtube, Other: sessions, orders, total sales,
   conversion %, Get report) — needs UTM / referrer capture. Payment Method Usage donut (filter All; shows "Partial COD").
   Primary Reason for Leaving (exit survey, "Configure" button; "No survey data"). Footer links.
03 Orders list: tabs All; search, filter, sort; Export; date range. Columns: Order ID (#2249 = Shopify order number),
   Customer, Email, Phone, Amount, Payment Mode (PayGlocal), Payment Status (Paid chip), Date created.
04 Abandoned Checkouts: Export, date range, search/filter/sort. Columns: Checkout ID (uuid), Email, Phone, Amount,
   Session State (chips: "Payment Page", "Payment Initiated"), Date created. (A checkout record is created at
   checkout start; state tracks the furthest step.)
05 Shipping and Delivery: Shipping Profiles synced from Shopify ("Last synced", Sync button). "General profile:
   215 products · 2 zones".
06 Shipping Zones (inside a profile): "Add Shipping zone". Zone Domestic·India and International·(country list, "25 more").
   Rate table: Rate name (+ download icon), Estimated delivery time, Range ("Orders from ₹0 and up"), COD chip
   (Inactive/Active), Active toggle, Actions edit/delete; zone "..." menu.
07-08 Edit Shipping Rate (side drawer): Name; Estimated time (optional, "3-5 Business days"); Type: based on order PRICE
   or order WEIGHT; Pricing conditions = rows of (min order price – max order price → shipping charge) each with its own
   "Accept cash on delivery" checkbox; next row's min auto = previous max + 0.01; "Add Rate"; Non-serviceable PIN codes
   (optional) via CSV upload + "Download a sample file"; Cancel / Save.
   DB: rate has slabs[]; each slab cod_allowed; blocked_pincodes per rate.
09 Coupons list: "Add Coupon"; search/filter/sort; select checkbox (bulk). Columns: Code (+ badges: ⚡ automatic,
   copy/combines icon, "Freebie", link icon, "Combines"), Orders, Gross sales, Discount amount, Net sales, Date created,
   Visibility (checkbox = shown in the list to shoppers), Active toggle, Edit / Delete; paging 25 rows.
   Examples on kurtiya: PREPAID 5% (automatic), FREEGIFT599/499/299 (freebie), B1G1 (buy 1 get 1), a test coupon.
   DB: per-coupon stats (orders, gross, discount, net) — computed from orders.
10 Coupon editor "Edit Amount off Products/Order Discount" — 5-step wizard: SETUP › CONDITION › USER ELIGIBILITY ›
   USAGE LIMITS › PREVIEW, live summary card on the right.
   SETUP: How applied: Coupon Code (customer types) / Automatic (shown in cart & checkout); Discount code text;
   What: Amount off order / Amount off products; Value: Percentage off / Fixed amount; value; "Maximum purchase amount cap"
   checkbox (cap on discount).
11 CONDITION: No purchase requirement / Min-Max purchase amount / Min-Max quantity of items.
12 USER ELIGIBILITY: All users / Specific users / Customer segment; All orders / First order only / Total order count.
13 USAGE LIMITS: max uses total (checkbox+number), max uses per customer; Combine with other discounts; Active period
   start date-time (+ optional end date); Disable COD (when this coupon applied → only prepaid); Disable Partial COD.
   Right summary card lists LIMITS (COD disabled, Partial COD disabled, no usage limit, valid from ...).
   NOTE: "PREPAID 5%" is AUTOMATIC + Disable COD + Disable Partial COD → that is how they reward prepaid.
14 PREVIEW: "Show discount coupon to customer" (works only if "Show Automatic Coupons" is on in Customization);
   Custom discount title ("Flat 5% OFF"), Custom discount details (bullets), "Suggested details" box with
   "Use suggestion" (auto-generated text from the rules). Right: live preview of the coupon card as the shopper sees it
   (icon, title, code chip, Hide/Show details, bullet, APPLY button).
15 Free Gift coupon "Edit Exclusive Free Gift Discount" — 4 steps (no Preview): SETUP: discount code; Free products
   (search + Browse Shopify products, chosen product row with remove), Free quantity. Note: "Products added as freebie
   are not considered in any other coupon even if combinable".
16 Free gift CONDITION: min/max purchase amount (₹599) + Maximum purchase amount cap; scope: For entire cart /
   For specific products / For specific collections.
17 Free gift USER ELIGIBILITY (same as 12).
18 Free gift USAGE LIMITS (same as 13; here Combine off, COD allowed).
   => Coupon TYPES seen so far: Amount off order/products (code or automatic), Exclusive Free Gift, Buy X Get Y (B1G1).
19 Buy X get Y SETUP: Coupon Code / Automatic + code.
20 BxGy CONDITION: "Customer buys": Minimum quantity of items OR Minimum purchase amount; Quantity; "Any items from":
   Specific collections / (products) + search/Browse list. "Customer gets": Quantity; Any items from (specific
   collections/products) + list. Note "Buy X get Y supported only with one-time purchases".
21 BxGy USER ELIGIBILITY (same). 22 BxGy USAGE LIMITS (same as 13). 23 BxGy PREVIEW: visibility + custom title/details
   (off here) → auto text "Flat 100% off on specific products · Valid on minimum purchase of 1 item(s)"; card "Buy 1 Get 1 FREE".
24 "Create Coupon" chooser (6 types): Amount off Products/Order; Buy X get Y; Purchase Driven (based on users' past
   order patterns); Exclusive Free Gift; Free shipping (NEW); Bundle Discount (NEW, save more when you buy as a bundle).
25 Payment Offers list: "Add Offer"; columns Code, Orders, Gross sales, Discount amount, Net sales, Active, Edit/Delete.
   One offer "PREPAID" (inactive). (Offer = discount tied to a payment method; editor not shown yet.)
26 Upselling: tabs All Rules / Active / Inactive; "Timer Settings"; "Add Rule". Rules list ordered (drag handle, priority
   number), name, chips "3M TIMER", "10% OFF", summary "WHEN COLLECTION 2 collection(s) → SHOW COLLECTION 2 collection(s)",
   Active chip+toggle, edit, delete.
27-28 Rule editor step 1 "Setup (title, trigger & target)": Rule name; WHEN trigger type (Specific Collection / Any
   Products / (specific products...)) + pick collections; SHOW target type (Collection / Products) + pick.
29 Step 2 "Rule Behavior (discount, timer & audience)": Customer Type (All / ...; "show to all customers regardless of
   order history"); Upsell Discount toggle + Discount % ("applied to the upsell product at checkout"); Countdown Timer
   toggle, Duration (minutes), When timer expires: "Remove Discount" (offer stays visible) / ...; note: timer resets
   every session (global Timer Settings).
30 Add Upselling Rule (new): trigger "Any Products" (activates for any product added to cart); target Products + pick.
31 Add upsell rule with a specific product picked; a "Failed to fetch" error toast appeared on Next (FlexyPe's own bug).
32 Rule Behavior step 2 for new rule: Target Audience > Customer Type (All...), Upsell Discount toggle off → "Add".
33 CUSTOMIZATION (dashboard/customization/general) — tabs: General / Login / Address / Payments; RIGHT = live mobile
   preview of the checkout ("Preview Desktop" link). Preview shows: header logo + strike price ₹2,000 → ₹1,925, "2 items"
   (expand ˅); breadcrumb ‹ Address » Payments; black banner "Use FIRST10 Coupon for 10% Off"; Coupons row; "Products you
   may like" (collapsible upsell); Contact Details: +91 phone; "Notify me about updates & offers" checkbox (ticked);
   Continue button; "Powered by FlexyPe".
   GENERAL tab: Logo upload (WEBP/PNG/JPG/GIF, max 150×40); Color scheme: Primary #283671, Text #FFFFFF,
   Upselling background #0098FF; CHECKOUT MODE (New): Standard (confirm address before payment) / One-Click Checkout
   (skip address step, land on payment with saved address + delivery option applied); LAYOUT: drag-to-reorder blocks
   Banner, Order Summary, Coupons, Upselling.
34 EXIT CHECKOUT FLOW (New) — what to show when the shopper tries to leave: Default (plain confirm) / Out of Stock Warning
   (items almost out of stock) / Savings Reminder (remind savings of applied coupon, or suggest an applicable coupon) /
   Survey (customizable exit survey → feeds dashboard "Primary Reason for Leaving").
   COUPON LAYOUT: Layout 1 (plain "Coupons ›" row) / Layout 2 (best coupon inline: "Save ₹120 with 'WELCOME5' · View all
   coupons · Apply"; falls back to Layout 1 when no applicable coupon).
35 ORDER SUMMARY (mobile only): Layout 1 (collapsible card "Order Summary • 1 item ₹300 ›") / Layout 2 (price + item count
   in the top bar with ˅). Show Quantity Changer (Recommended) toggle ON (change qty inside checkout).
36 Toggles: Show Additional Product Details (variant / notes under each item) ON; Show Compare-at Price ON.
   REDIRECT TO SHOPIFY CHECKOUT toggle (off) + Redirect Text (50 chars, e.g. "Ordering from outside India?") — a link
   to bypass to native Shopify checkout. OTHER: Show Gift Card CTA (off); Show Automatic Coupons (New) ON; Automatic
   Coupon Removable (New) off; Show COD Availability Reasons (New) off (explain why COD unavailable: pincode, cart value);
   Auto Redirect International Visitors to Shopify Checkout (…continues).
37 (end of General) Auto Redirect International Visitors to Shopify Checkout toggle (off): detect international customers
   and send them to native Shopify checkout.
38 CUSTOMIZATION > LOGIN tab (each step has its own settings; preview switches to that step):
   Banners toggle ON: list of rotating banner texts (emoji ok) each with show/hide eye + edit + drag order; Banner background
   #9A84C8, text #FFFFFF; preview shows a carousel banner with ‹ › arrows. BUTTON text "Quick Login" (30 chars).
   COUPONS: Show Coupons ON; Show Locked Coupon Message (coupons only after login) off.
   Preview also shows a TRUST BADGES row: Fast Shipping, Authorized Seller, 24/7 Support, Secure Checkout.
39 LOGIN cont.: Coupon UI: As coupon cards / As code entry field; UPSELLING: Show Upselling ON; ADDITIONAL: Auto Scroll to
   Action ON (skip past banners/summary/coupons/upsell straight to the main action); TRUST BADGES toggle ON + 4 icon tiles.
40 ADDRESS tab: same Banners block (per step), Button text "Deliver here"; Coupons + Coupon UI. Preview: "Delivery Address"
   + "Add Address" button; saved address cards (name, tag "Other"/Home/Work, full address, phone, email, "..." menu =
   edit/delete) — list of the customer's saved addresses (FlexyPe network-wide by phone).
41 ADDRESS cont.: Upselling, Auto Scroll, ADDRESS FORM: Show Additional Address Line (landmark) toggle; Make it Required.
42 PAYMENTS tab: Banners, Coupons, Coupon UI, Upselling, Additional settings (per step). Preview: "PAYMENT METHODS" card:
   "₹1,686.20 · Extra 5% off · Pay via UPI" + UPI app icons; "+91 (phone) · Not you?" (switch user).
43 PAYMENTS tab top (same banners/coupons/upsell blocks).
44 PAYMENTS cont.: BILLING & GST: Show Billing & GST Section toggle (off) — business customers enter billing + GSTIN.
   COD CONFIRMATION: Show COD confirmation popup ON (Confirm / Cancel before placing a COD order).
45 PAYMENT METHOD UI: Layout 1 (UPI · "Pay with installed apps, or any UPI ID") / Layout 2 (+ discounted price "₹712.45 · 5% off"
   on the right) / Layout 3 (price first "₹712.45 · Extra 5% off · Pay via UPI" + app icons) — chosen 3.
   PAYMENT METHODS list (drag to reorder; each: eye show/hide + edit (label/text)):
46-48 UPI ("Pay via UPI", visible), COD ("Cash on Delivery", hidden), EMI ("Pay via EMI", hidden), PARTIAL COD
   ("Partial Payment (Pay ₹X on delivery)", hidden), CARD ("Pay via Debit/Credit cards", hidden), SNAPMINT ("Pay with EMI on
   Snapmint", hidden), WALLET ("Pay via Wallets"), VELOCITY ("Pay with EMI on Velocity"), PAY LATER, NET BANKING,
   REDIRECT SHOPIFY ("Use gift cards or other credits" → native Shopify checkout). On kurtiya only UPI is shown.
   NOTE: the "Extra 5% off" on UPI = the automatic PREPAID 5% coupon (COD disabled) shown per method.
49 end of payment methods list (Velocity, Pay later, Net banking, Redirect Shopify).
50 RTO SUITE (dashboard/rto-suite): "Choose how RTO rules are applied": Single rule (only highest-priority matching rule) /
   All rules together (Recommended; strictest outcome wins). ORDER & CART RULES (each a row → opens its editor; they
   control COD and Partial COD availability): Filter based on cart amount (min/max cart value); cart item count (limit
   items per order); total COD order count (customer's past COD orders); new vs repeat customers (total orders across all
   methods); returned orders (history of returns).
51 CUSTOMER & PRODUCT FILTERS: Filter based on user (specific customers / segments); pincode (allow or block service
   areas); state (allow/block states); products (include/exclude); collections.
   (Editors of each filter not captured.)
52 SETTINGS (dashboard/settings/store) — left sub-menu: Store Details, Payments, Taxes & Duties, Integrations, API Keys,
   Billing & Usage, Users & Permissions, Activity Logs, Webhook Logs, Change Password.
   STORE DETAILS: Store name, Store URL (custom domain), Shopify domain (*.myshopify.com); CREDENTIALS: Admin API access token
   (masked, eye), Storefront API access token. BUSINESS DETAILS (Edit): Trade name, Legal name, Category (Apparel),
   Registration type, Company name on GST, GSTIN, Address.
53 FINANCE POINT OF CONTACT for billing: "Add contact" (name, email, phone; edit/delete); note: a contact does not get
   dashboard access (that is Users & Permissions).
54 SETTINGS > PAYMENTS: gateway cards with Inactive/Active chip + "Configure ›": Razorpay, CCAvenue, PhonePe, Cashfree,
   Easebuzz, PayU, Snapmint, Velocity, Decentro, Paytm; INTERNATIONAL PROVIDERS: XPay, PayGlocal (Active on kurtiya).
   Below: "Payment Methods" section (continues).
55-56 SETTINGS > PAYMENTS cont.: "Payment Methods" routing table: for each method choose WHICH gateway processes it (dropdown):
   UPI / QR Code → PayGlocal; EMIs; Debit/Credit cards; Wallets; Pay Later; Netbanking (empty = not offered).
   Box "Payment methods visibility — manage in Customization" + "Manage Visibility" link.
   DB: gateway_accounts per store (provider, credentials encrypted, active, webhook_confirmed); method_routing
   (method → gateway_account).
57 "Configure PayGlocal" modal: Merchant ID, Public Certificate (PEM text), Private Key (PEM; "not stored permanently, must be
   re-entered each time you make changes" = write-only field), Public Certificate KID, Private Key KID; checkbox "I have
   successfully configured the webhook" + "View documentation"; Delete / Cancel / Save.
58 "Configure PayU": Key, Salt, webhook-configured checkbox. 59 "Configure Easebuzz": Key, Salt, webhook checkbox.
   (Each gateway = its own small form of credential fields.)
60 SETTINGS > TAXES & DUTIES: Regional settings: "Base taxes — synchronized with Shopify, cannot be edited": India 9%;
   per state 18% IGST "instead of 9% federal tax" (paged list). Then "Tax Rates and Exemptions > Product Overrides" (continues).
61 TAXES cont.: Tax Rates and Exemptions > Product Overrides ("customize taxes for individual collections") + "Add override".
62 SETTINGS > INTEGRATIONS: ADS & ANALYTICS: Meta Pixels (Enabled), Google Analytics, Google Ads, Customers Labs;
   COIN & REWARDS: Nector, Reward Rally, Axentra, Yuko; MARKETING AUTOMATION: Abandoned Checkout Webhooks, 11za (WhatsApp),
   … (each row: Enabled/Disabled chip + › to configure).
63 SETTINGS > USERS & PERMISSIONS: Store owner card (name, email, last login; "some owner permissions can't be assigned to
   staff"); Users and Permissions list + "Add user".
64 SETTINGS > ACTIVITY LOGS: who (name, email, avatar) did what ("Updated coupon - X", "Bulk updated coupons - X"), when;
   Load More. (FlexyPe's own staff also appear — their support edits the merchant's settings.)
65 SETTINGS > WEBHOOK LOGS: date range; cards Total events / Delivered / Failed; table Destination, Webhook version, Status,
   Attempts, Date; search/filter/sort.
66 SETTINGS > CHANGE PASSWORD: old / new / confirm.
67 Top-right store menu: store name + login email, Logout. (Store switcher for multiple stores.)

68 SETTINGS > API KEYS: "Manage API keys for your platform integrations" + "Generate API Key" (empty).
69 CREATE PAYMENT OFFER — 4 steps SETUP › CONDITION › USER ELIGIBILITY › USAGE LIMITS (no Preview), right summary card.
   SETUP: "Applies automatically when user selects payment method"; Discount code + Custom discount title (checkbox);
   value Percentage off / Fixed amount; APPLY TO: All online payment modes / Set for individual payment modes
   (then a value per mode); % off; Maximum purchase amount cap.
   DB: payment_offer = coupon of kind 'payment' with per-method values.
70 RTO SUITE > Filter based on pincode: empty state "No rules found — Create your first pincode rule" + "Add Rule"
   (each filter holds a LIST of rules; rule form not captured).
71 Orders list again (same as 03; no order detail page captured).
72 CREATE PURCHASE DRIVEN DISCOUNT — 6 steps SETUP › USER BEHAVIOUR › CONDITION › USER ELIGIBILITY › USAGE LIMITS › PREVIEW.
   SETUP: Coupon code / Automatic, code, Percentage / Fixed, value, max cap. Summary: "Purchase Driven · 0% off on total
   value · Coupon will not be shown to any customer". (User Behaviour step = based on past order patterns; not captured.)

73 CREATE FREE SHIPPING DISCOUNT — 5 steps SETUP › CONDITION › USER ELIGIBILITY › USAGE LIMITS › PREVIEW.
   SETUP: Coupon code / Automatic, code; Shipping rates: "Exclude shipping rates over a certain amount" (checkbox + amount:
   free shipping does not cover rates above it).
74 CREATE BUNDLE DISCOUNT — same 5 steps. SETUP: Coupon code / Automatic, code; Applies to: Specific products / Specific
   collections + search/Browse; "Single Product Pack Options" (bundle multiple quantities or variants of ONE product);
   Quantity (items in the bundle; discount stops after it); Discount types: Fixed bundle price (pay a set price for the
   group) / Fixed amount off / Percentage off.
75 UPSELL > TIMER SETTINGS (store-wide): Upsell Timer Scope > Timer Level: "Per Session" (timer resets after each checkout
   session ends) / (other levels, e.g. per customer); Save Config.
   => All 6 coupon types now seen except Purchase Driven's "User Behaviour" step.

76-77 ORDER DETAIL (dashboard/orders/<uuid>): header "Order #<Shopify number>" + chips Paid / Unfulfilled + date; Edit,
   previous / next order arrows. ORDER ITEMS (fulfilment chip): image, title, variant chip ("GOLD / PACK OF 3"), compare-at
   price struck, unit price × qty, line total, the discount applied to the line ("PREPAID 5% (−₹x)").
   ORDER SUMMARY (payment chip): Subtotal (n items), Discounts (code, −₹), Shipping (rate NAME + amount: note the rate is
   named "Free shipping" but the ₹0-199 slab charged ₹30), Total, Paid.
   Right column: CUSTOMER (name, "1 order" link), contact (email, phone), shipping address, billing address ("same as
   shipping"). ADDITIONAL DETAILS = attribution saved with the order: Landing page, Original referrer, UTM medium /
   content / term / campaign / source, fbclid. TRANSACTIONS: Payment · Success, amount, method (UPI), gateway (PayGlocal),
   gateway transaction ID (copy), time.
   DB: orders keep landing_page, referrer, utm_* , fbclid (captured when the checkout session starts);
   transactions table (one order → many attempts / refunds).
OWNER 2026-10-14: skip for now — Billing & Usage page, RTO "Add Rule" form, Purchase Driven "User Behaviour" step
   (Claude designs them from the rest; written down when built).

STILL NOT CAPTURED (low priority): an abandoned checkout's detail, notifications (bell), integration config screens.
```

### (b) Add to cart / cart drawer setup

Source: 20 screenshots (2026-10-14 12:26-12:28) of FlexyCart inside the kurtiya Shopify admin. Structure only.

**Big ideas**
- The cart drawer is set up from a **Shopify embedded app** ("FlexyCart by FlexyPe", unlisted: installed by link, not
  in the App Store search) and switched on with a **theme app embed** (one toggle in the theme editor, no code paste);
  the embed has one setting: the theme's cart-count class, so the theme's own badge stays right.
- Drawer editor = section list | settings | live drawer preview. Sections: Announcements, Reward Bar, Upsells, Add-ons,
  Additional Notes, Confirmation Text, Discount Codes, Trust Badges, Free Gifts, Settings, colour palette. Several
  drawers per store, one active.
- Free gifts (and coupons) in the cart come from the SAME rules as the checkout ("Manage in FlexyPe").
- Our current ShopDrawer already has almost the same section list; the gaps are: Shopify app + theme embed install,
  several drawers, trust-badge logo library, one shared rules engine with the checkout, live preview with real products.

**Screen by screen**

```text
C01 FLEXYCART = a SHOPIFY EMBEDDED APP (inside Shopify admin: Apps > FlexyCart > "Drawers"; not on dashboard.flexype.io).
   Drawers list: "Default" drawer (thumbnail, Active chip, added / last saved dates, "..." menu, Customize); "Preview",
   "+ Create" (several drawers per store, one active). Card "Enable FlexyCart for your store" + "Enable FlexyCart" button.
C02 Installed through a THEME APP EMBED (Theme editor > App embeds > FlexyCart toggle; toast "FlexyCart activated").
   Embed setting "Selectors > Cart Count Classname" (e.g. cart-count-bubble) so the theme's own cart count updates;
   "Manage app" link. (= Shopify Theme App Extension; no manual <script> paste.)
C03 DRAWER EDITOR (3 columns: section list | settings | LIVE drawer preview with sample products). Sections, each with an
   Active chip: Announcements, Reward Bar, Upsells, Add-ons, Additional Notes, Confirmation Text, Discount Codes,
   Trust Badges, Free Gifts, Settings. COLOR PALETTE: Primary color, Text color.
   ANNOUNCEMENTS: Enable toggle; Mode "Rotating Messages" (or static); messages list (50 chars each, emoji ok, delete,
   "Add Message"); Display duration (seconds).
   PREVIEW shows the drawer: "Your cart (3)" + close; announcement strip; reward bar; ORDER SUMMARY items (image, qty badge,
   title, compare-at struck, price, "10% Off", − qty +, delete); Coupons row + "You saved ₹x on this order 🎉"; Products
   you may like; "I accept the terms and conditions" checkbox; total "₹x · Estimated total"; big "⚡ Checkout" button;
   payment icons row (UPI apps, Mastercard, Paytm, PhonePe); "Secured by FlexyPe".
C04 REWARD BAR: Enable; Template "With Icon"; Counting method "Total Value" (or quantity); Enable confetti; REWARD TIERS list
   (name, type e.g. Shipping / gift, threshold ₹; edit/delete; "Add Tier"). Preview: "Congrats! You achieved this tier",
   track with milestone icons and labels.
C05 UPSELLS: Enable; Title (30 chars, "Products you may like"); Mode Manual (or auto); Type Products; Select products (search,
   Browse, list with price, remove); "Limit number of upsells" + Maximum upsells to show (10). Preview: horizontal cards
   with image, title, price, "Add" button.
C06 Upsells cont. (same as C05).
C07 ADD-ONS: Enable toggle (off on kurtiya); "Add-on Rules" list + "Add Rule"; empty state "No add-on rules configured —
   add rules to offer product add-ons" (rule form not captured; current ShopDrawer has trigger product → add-on product + price).
C08 ADDITIONAL NOTES: Enable; Position Body (or footer); Title (30, "Add instructions"); Placeholder (30, "Add note here...");
   Limit character count + Maximum length (300). Preview: link "✎ Add instructions" that opens a textarea.
C09 CONFIRMATION TEXT: Enable; Content (100, "I accept the terms and conditions"); Enable checkbox; Required checkbox.
C10 DISCOUNT CODES (in the cart): Enable; Mode "Input Field" (or list); Position Body; Input placeholder (30); Apply button text
   (10); Messages: Invalid code message, Applied message; Confetti: Enable confetti. Preview: "Coupons ›" row and
   "You saved ₹x on this order 🎉" (savings = compare-at + discounts).
C11-12 TRUST BADGES: a big grid of payment / wallet / card logos (~70: Airtel, Amazon Pay, BHIM-style UPI, Cashfree, CCAvenue,
   Easebuzz, GPay, Paytm, PayU, PhonePe, Razorpay, Snapmint, Mastercard, Visa, Amex, Apple Pay, PayPal, Stripe, COD,
   Cash on pick up, ...); tick the ones to show; chosen ones appear as the logo row under the Checkout button.
C13 FREE GIFTS in the cart editor: "Manage in FlexyPe" — when FlexyPe checkout is used, free gifts are configured in the
   FlexyPe dashboard (= the "Exclusive Free Gift" coupon type). Feature list: triggers on cart total / quantity / specific
   products; multiple gift tiers; confetti on unlock; smart add/remove/display; max gifts per cart.
   => ONE rules engine (coupons) feeds both the cart drawer and the checkout.
C14 SETTINGS (drawer): DISPLAY — Pricing: Show compare-at price, Show savings; Products: Show variant selector, Show
   properties; Cart: Open drawer on add to cart. EMPTY CART STATE: Title (30), Description (50), Button text (25),
   Button URL (/collections/all).
C15 COLOR PALETTE picker: colour square + hue slider + Hex field.
C16 Colour picker for Text colour (same control).
C17 App "..." menu (Shopify admin): Manage app, Get support, Pin to your navigation, Uninstall.
C18-20 SHOPIFY SETTINGS > APPS > FlexyCart "by FlexyPe": installed 1 week ago; yellow note "This app is NOT listed in the Shopify
   App Store. Contact the app developer for support" (= UNLISTED app, installed by link); "A quick cart drawer that lets
   shoppers edit items and variants". Billing card "No plan selected" (they charge outside Shopify billing). Extensions
   "1 active — Available for Online Store" (the theme app embed). ACCESS (view + edit): Customers, Custom data (metafields),
   Discounts, Marketing, Online Store, Orders, Products. Privacy: reads device & activity data (geolocation, IP, browser,
   browsing behaviour, client ID cookie). App history: installed 3 Oct by the store. Uninstall app.
   => FlexyPe = TWO surfaces: (1) Shopify embedded app "FlexyCart" for the cart drawer + install; (2) its own web
   dashboard (dashboard.flexype.io) for checkout, coupons, payments, RTO, analytics.
```

### (c) On the Shopify storefront

Source: 19 screenshots (2026-10-14 12:31-12:32) of kurtiya.shop on a desktop browser: product page → cart drawer →
checkout popup → PayGlocal. Structure only (the test shopper's name / phone / address on screen were NOT copied).

**How it flows**
1. Product page is the theme's own. "Add to cart" opens the drawer; "Buy it now" skips the cart.
2. Checkout is a POPUP over the store ("Creating your order…" first), never a new page. Desktop = 2 columns (summary,
   address, gifts, upsell on the left; payment on the right). Automatic coupon pops with confetti.
3. Pay opens the gateway in a new tab; the store tab shows "Processing payment… Retry payment" and polls the status.
4. Rules live everywhere at once: B1G1 groups pairs in the cart, free gifts drop in as "Free Gift" lines when a tier is
   reached, the reward bar moves, "You saved ₹x" updates.

**Screen by screen**

```text
S01 PRODUCT PAGE (desktop, theme's own): variant pickers (colour swatches, pack size), quantity, "Add to cart" (outline) and
   "⚡ Buy it now" (black). Theme blocks: rating badge, "BUY 1 GET 1 FREE" offer card, chat bubble (ShipTrack widget).
S02 "BUY IT NOW" → centred white MODAL over the store: "Creating your order..." + spinner logo + "Powered by FlexyPe"
   (skips the cart; checkout for that one variant). Sticky bottom bar on the product page: image, title, variant select
   with price, qty, Add to cart.
S03 CHECKOUT MODAL (desktop = 2 columns inside the popup; store logo top, ✕ close):
   LEFT: banner carousel (purple, ‹ ›); ORDER SUMMARY "• 1 item · Saved ₹481" (expand ˅) + Grand Total; DELIVERY ADDRESS card
   (name + tag HOME, address, phone, email, change); shipping line "Free shipping"; FREE GIFTS FOR YOU: carousel of gift
   cards (image, title, struck price → "Free", Add button disabled, progress bar + 🔒 "Add items worth ₹175.00 or more in the
   cart to unlock this offer"); footer "T&C | Privacy", "Powered by FlexyPe".
   RIGHT: payment card "₹147.80 · Pay via UPI" + UPI app icons; "+91 phone · Not you?".
   On open an "Automatic coupon applied! You just saved ₹x on this order!" popup with CONFETTI + "Woohoo! Thanks".
   (Logged-in returning shopper: address already filled → straight to payment = one-click.)
S04 CART DRAWER (right side, full height): "Your cart (1)" ✕; announcement strip; reward bar "You're ₹75.00 away" with
   milestones (free shipping, Free gift's ×3); ORDER SUMMARY: item image + qty badge, title, VARIANT DROPDOWN inside the cart
   (change Silver / pack-of-3 without leaving), − qty +, delete, ₹599 struck → ₹117.80, "80% Off"; Coupons › + "You saved
   ₹6.20 on this order 🎉"; Products you may like (cards + Add); T&C checkbox; "₹117.80 Estimated total"; "⚡ Checkout";
   payment logos; "Secured by FlexyPe". Page behind is dimmed.
S05 B1G1 IN THE CART: adding a 2nd unit → group box "✓ B1G1 applied!" with both lines; one shows "₹1,198 struck · Free",
   the other ₹124 "90% Off"; reward bar moves (free shipping reached); "You saved ₹124.00 on this order 🎉".
S06 Cart with 3 units: one B1G1 pair (free + paid) grouped, the 3rd unit alone at full sale price; reward bar shows the 2nd
   milestone reached, "You're ₹127 away" from the next. (B1G1 pairs units one by one.)
S07 Cart (8): every pair gets its own "B1G1 applied!" box; reward bar "Congrats! You achieved this tier" (all reached).
S08 FREE GIFTS ADDED AUTOMATICALLY as cart lines when tiers are reached: gift lines with chip "🎁 Free Gift", struck price →
   "Free", no qty / delete controls; "You saved ₹1,195.00 on this order 🎉" (savings include gifts).
S09-10 Upsell carousel with ‹ › arrows; "✎ Add instructions" (note); T&C checkbox; total; Checkout.
   NOTE: the announcement strip rotates every few seconds (Free shipping above ₹999 / Fast delivery 6-7 days / B1G1).
S11 COUPONS in the cart = BOTTOM SHEET "Apply Discount Code": input + Apply, and chips of the visible codes (B1G1,
   FREEGIFT599, FREEGIFT499, FREEGIFT299) to tap.
S12-13 cart scrolled (announcement strip scrolls like a marquee between messages).
S14 CHECKOUT from the cart → same "Creating your order..." modal (cart badge on the theme's bag icon shows the count).
S15 CHECKOUT MODAL for 8 items: Order summary "• 8 items · Saved ₹3,570" + Grand total; Delivery address card with "✎ Edit";
   shipping line "Free shipping · Free"; savings card "You saved ₹1,195 on this order · View all coupons ›";
   "MOST LIKED ✨" upsell block with a COUNTDOWN "⏱ 2m:59s" (the upsell timer) and product cards with variant text; confetti
   again on open; right side payment "₹372.00 Pay via UPI".
   NOTE: "Saved ₹3,570" (summary, includes compare-at) differs from "You saved ₹1,195" (coupon card) — two different
   savings numbers on one screen; we should show ONE clear number (or label both).
S16-17 Checkout modal scrolled: the summary chip alternates "Saved ₹3,570" / "🎁 Free Gift"; upsell cards: image, title,
   variant text, struck price → price, "10% Off", "View (4 options)" for products with variants; timer counts down
   (2m:58s → 2m:56s); "T&C | Privacy" links.
S18 PAY: the gateway page opens in a NEW TAB; the checkout modal shows "Processing Payment — Hold on while we are getting
   your transaction details" + rupee coin animation + "If you are unable to complete payment, you can Retry payment" +
   "Do not refresh or close this page until your transaction completes" (the original tab POLLS the payment status).
S19 PAYGLOCAL hosted page (api.payglocal.com/gl/payflow-ui): left blue panel = merchant logo + legal entity name, "PAYING
   ₹372.00 INR", security logos (PCI DSS, Verified by Visa, MasterCard SecureCode, SafeKey); right = "Complete your payment":
   UPI (Generate QR), Credit or debit card, NetBanking (+32 banks); "Powered by PayGlocal".
   => The shopper never leaves the store tab; result comes back by polling (and the gateway callback), not by trusting a
   redirect. Same pattern for us (it also closes problem 1: verify with the gateway before "paid").
NOT SEEN: phone (mobile) layout of drawer / checkout, the address entry for a NEW shopper (phone step), COD flow, the
   thank-you screen after payment, a failed payment.
```

### (d) Phone video (owner's WhatsApp video, 24 s, iPhone, kurtiya.shop)

```text
V00-03 Product page on the phone: sticky bottom bar (variant select "Silver / pack-of-3 - R…" + Add to cart), chat bubble;
   Buy it now.
V03 "Creating your order..." full screen + FlexyPe logo (on the phone the checkout is a FULL-SCREEN page, not a popup).
V03-07 MOBILE CHECKOUT (one scrolling page): top bar ‹ back, store logo, ₹599 struck → ₹154, "1 item ˅" (order summary
   folds into the top bar = "Order summary Layout 2"); purple banner carousel; DELIVERY ADDRESS card ALREADY FILLED (name +
   HOME tag, address, phone, email, ✎ Edit) for a returning shopper on the same phone; shipping line "Free shipping ₹30.00"
   (again: a ₹30 charge under a "Free" name, design rule 1); Free gifts for you (locked card + progress "Add items worth
   ₹175 or more…"); Coupons ›; MOST LIKED upsell with timer "⏱ 3m:00s" counting down and "Price drop!" / "10% Off";
   PAYMENT METHODS: "₹154.00 Pay via UPI" + UPI app icons; "+91 phone · Not you?"; Powered by FlexyPe. Auto-scroll moves the
   page down to the payment card.
V07-09 Tap UPI → about:blank → "Taking you to the secured checkout experience… Powered by PayGlocal" (same tab on the phone).
V09-13 PayGlocal mobile page: merchant logo + legal name, "PAYING ₹154.00 INR", UPI: "Choose a UPI app to continue"
   (PhonePe, GPay, Paytm, BHIM, View more UPI apps), button "Pay ₹154.00 INR via Paytm" (toast "Please select any UPI app"
   if none), Credit or debit card; then "Processing your payment… You will receive a notification from Paytm" and the
   browser's "This site is trying to open another application — Allow" (UPI intent).
V14-24 Paytm app opens with the merchant's UPI ID and ₹154; bank account picker; screen-recording warning (the recording
   itself). The video ends before the payment finishes.
NOT IN THE VIDEO: how the address got there. The shopper was already known on this phone (same "test by team" address as
   the desktop screenshots, "Not you?" next to the number), so the address came from a remembered session, not from typing a
   number. The new-shopper phone / OTP step, COD, thank-you page and a failed payment are still unseen.
```

## Database design

Not started on purpose (rule 3). Collect "notes for the database" in the inventory above; design
the whole schema once, at the end.
