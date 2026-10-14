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
   "₹1,686.20 · Extra 5% off · Pay via UPI" + UPI app icons; "+91 88888 88881 · Not you?" (switch user).
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

NOT CAPTURED (ask the owner): API Keys page, Billing & Usage page (FlexyPe charges the merchant: "Outstanding payable" card),
Payment Offer editor, each RTO filter's editor, an order's detail page, an abandoned checkout's detail, Upsell "Timer
Settings", notifications (bell), Purchase Driven / Free shipping / Bundle coupon editors, integration config screens.
```

### (b) Add to cart / cart drawer setup

_(later)_

### (c) On the Shopify storefront

_(later)_

## Database design

Not started on purpose (rule 3). Collect "notes for the database" in the inventory above; design
the whole schema once, at the end.
