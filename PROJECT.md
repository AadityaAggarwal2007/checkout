# ShopDrawer — Project Documentation

## What We're Building
A **FlexyCart clone** — a self-hosted, multi-store Shopify checkout drawer SaaS.
Stores embed a `<script>` tag into their Shopify theme. It renders a slide-out cart drawer
with announcements, reward bar, upsells, free gifts, discount codes, and a full checkout
flow (contact → address → payment via SabPaisa). No Shopify Plus needed. No paid apps.

---

## Project Location
```
~/Desktop/Shopify solution/
```

---

## Architecture
```
Dashboard (Next.js 14, port 5003)
    ↓ config CRUD via REST API
Server (Express + Prisma + PostgreSQL, port 5002)
    ↓ serves widget.js + API endpoints
Widget (vanilla JS, embedded in Shopify theme via <script> tag)
    ↓ uses Shopify Cart API (/cart.js etc.) + calls server for config/checkout
Payment Gateway: SabPaisa
Order creation: Shopify Admin API (after payment success)
```

---

## File Structure & Status

### Server — `~/Desktop/Shopify solution/server/`
| File | Status | Purpose |
|------|--------|---------|
| `package.json` | ✅ Done | express, prisma, bcryptjs, jwt, crypto-js, axios, uuid |
| `.env.example` | ✅ Done | DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, PORT=5002, SABPAISA_* |
| `prisma/schema.prisma` | ✅ Done | User, Store, StoreUser, DrawerConfig, Order models |
| `src/index.js` | ✅ Done | Express app entry, routes mounted, static serving of public/ |
| `src/db.js` | ✅ Done | PrismaClient singleton |
| `src/middleware/auth.js` | ✅ Done | JWT authenticate + storeAccess middleware |
| `src/routes/auth.js` | ✅ Done | POST /api/auth/register, /login, GET /verify |
| `src/routes/stores.js` | ✅ Done | CRUD /api/stores, token encryption/decryption |
| `src/routes/config.js` | ✅ Done | GET/PUT /api/stores/:storeId/config (partial section updates) |
| `src/routes/products.js` | ✅ Done | GET /api/stores/:storeId/products (Shopify proxy) |
| `src/routes/orders.js` | ✅ Done | GET /api/stores/:storeId/orders (dashboard order list) |
| `src/routes/widget-api.js` | ✅ Done | GET /api/widget/config, /upsell-products, POST /validate-coupon |
| `src/routes/payments.js` | ✅ Done | POST /api/payments/create-order, /callback, GET /order-status |
| `src/services/shopify.js` | ✅ Done | getProducts, verifyPrices, validateCoupon, createOrder |
| `src/services/sabpaisa.js` | ✅ Done | initiatePayment, verifyCallback, parseCallback |
| `public/widget.js` | ✅ Done | Built widget bundle (32KB minified IIFE) |

### Dashboard — `~/Desktop/Shopify solution/dashboard/`
| File | Status | Purpose |
|------|--------|---------|
| `package.json` | ✅ Done | Next.js 14, React 18, Tailwind, TypeScript |
| `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `next.config.js` | ✅ Done | Config files |
| `.env.local.example` | ✅ Done | NEXT_PUBLIC_API_URL=http://localhost:5002 |
| `src/types/index.ts` | ✅ Done | All TypeScript interfaces (Store, DrawerConfig, Order, etc.) |
| `src/lib/api.ts` | ✅ Done | Typed fetch wrapper with Bearer token auth |
| `src/lib/auth.ts` | ✅ Done | useAuth() hook |
| `src/app/layout.tsx` | ✅ Done | Root layout with Toaster |
| `src/app/page.tsx` | ✅ Done | Redirect to /login or /dashboard |
| `src/app/login/page.tsx` | ✅ Done | Login form |
| `src/app/register/page.tsx` | ✅ Done | Register form |
| `src/app/dashboard/layout.tsx` | ✅ Done | Sidebar + StoreSelector + StoreContext |
| `src/app/dashboard/page.tsx` | ✅ Done | Overview + embed snippet |
| `src/app/dashboard/announcements/page.tsx` | ✅ Done | Rotating messages config |
| `src/app/dashboard/reward-bar/page.tsx` | ✅ Done | Tier-based reward bar config |
| `src/app/dashboard/upsells/page.tsx` | ✅ Done | Upsell product picker config |
| `src/app/dashboard/addons/page.tsx` | ✅ Done | Add-on rules config |
| `src/app/dashboard/notes/page.tsx` | ✅ Done | Additional notes config |
| `src/app/dashboard/confirmation/page.tsx` | ✅ Done | T&C confirmation config |
| `src/app/dashboard/discounts/page.tsx` | ✅ Done | Discount codes config |
| `src/app/dashboard/trust-badges/page.tsx` | ✅ Done | Trust badge selection |
| `src/app/dashboard/free-gifts/page.tsx` | ✅ Done | Free gift tier config |
| `src/app/dashboard/settings/page.tsx` | ✅ Done | Display + empty cart settings |
| `src/app/dashboard/colors/page.tsx` | ✅ Done | Color palette + live preview |
| `src/components/Sidebar.tsx` | ✅ Done | Nav sidebar with all 11 sections |
| `src/components/StoreSelector.tsx` | ✅ Done | Dropdown + Add Store modal |
| `src/components/ConfigForm.tsx` | ✅ Done | Reusable save/reset form wrapper |

### Widget Source — `~/Desktop/Shopify solution/widget-src/`
| File | Status | Purpose |
|------|--------|---------|
| `package.json` | ✅ Done | esbuild dev dependency |
| `build.js` | ✅ Done | esbuild config → outputs to server/public/widget.js |
| `src/utils/formatter.js` | ✅ Done | formatPrice (INR), formatDiscount |
| `src/utils/api.js` | ✅ Done | Fetch wrapper for widget server API |
| `src/utils/confetti.js` | ✅ Done | Lightweight canvas confetti (fireworks/stars) |
| `src/styles.js` | ✅ Done | All CSS as JS string, color-configurable |
| `src/cart.js` | ✅ Done | Shopify Cart API wrapper (fetch, add, update, remove, note) |
| `src/components/announcements.js` | ✅ Done | Rotating banner component |
| `src/components/reward-bar.js` | ✅ Done | Tiered progress bar + confetti trigger |
| `src/components/product-card.js` | ✅ Done | Cart item with qty controls, prices |
| `src/components/upsells.js` | ✅ Done | Horizontal scrollable upsell cards |
| `src/components/free-gifts.js` | ✅ Done | Locked/unlocked gift tiers |
| `src/components/coupons.js` | ✅ Done | Coupon section with savings display |
| `src/components/trust-badges.js` | ✅ Done | Payment icon row |
| `src/components/notes.js` | ✅ Done | Notes textarea with char counter |
| `src/components/confirmation.js` | ✅ Done | T&C checkbox |
| `src/components/checkout-form.js` | ✅ Done | Multi-step: contact → address → payment |
| `src/drawer.js` | ✅ Done | Main drawer shell — renders all components together |
| `src/index.js` | ✅ Done | IIFE entry point — reads data-store-key, fetches config, intercepts add-to-cart |

### Infrastructure — `~/Desktop/Shopify solution/`
| File | Status | Purpose |
|------|--------|---------|
| `ecosystem.config.js` | ✅ Done | PM2 config for server (5002) + dashboard (5003) |
| `setup.sh` | ✅ Done | Install deps, prisma push, build widget + dashboard |

---

## What's Left to Build

### 1. `widget-src/src/drawer.js` — The main drawer shell
Creates the slide-out overlay + panel DOM structure, renders all components (announcements, reward-bar, product cards, upsells, free-gifts, coupons, trust-badges, notes, confirmation), handles open/close, re-renders on cart change.

### 2. `widget-src/src/index.js` — Widget entry point (IIFE)
- Reads `data-store-key` from the `<script>` tag
- Fetches config from `/api/widget/config?key=...`
- Injects styles into page
- Intercepts add-to-cart (form submit + fetch monkey-patch for AJAX themes)
- Opens drawer on add-to-cart if `settings.openDrawerOnAdd` is true
- Renders a floating cart button

### 3. `ecosystem.config.js`
```js
module.exports = {
  apps: [
    { name: 'drawer-server', script: 'server/src/index.js', env: { PORT: 5002 } },
    { name: 'drawer-dashboard', script: 'npm', args: 'start', cwd: 'dashboard', env: { PORT: 5003 } }
  ]
}
```

### 4. `setup.sh`
Install server deps → npm install in widget-src → build widget → install dashboard deps → prisma generate → prisma db push → build dashboard

---

## Environment Variables Needed

### Server `.env`
```
DATABASE_URL=postgresql://user:password@localhost:5432/shopdrawer
JWT_SECRET=your-secret-here
ENCRYPTION_KEY=your-32-char-key-here
PORT=5002
DASHBOARD_URL=http://localhost:5003
SABPAISA_MERCHANT_ID=
SABPAISA_CLIENT_CODE=
SABPAISA_AUTH_KEY=
SABPAISA_AUTH_IV=
SABPAISA_CALLBACK_URL=https://yourdomain.com/api/payments/callback
WIDGET_CALLBACK_URL=https://yourdomain.com
```

### Dashboard `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:5002
```

---

## How the Widget Gets Embedded in Shopify
Add to Shopify theme `theme.liquid` before `</body>`:
```html
<script src="https://YOUR_SERVER_URL/widget.js" data-store-key="YOUR_WIDGET_KEY"></script>
```
Widget key is shown on the dashboard Overview page after connecting a store.

---

## Shopify Custom App Scopes Needed
Create a custom app at: Shopify Admin → Settings → Apps → Develop apps
Required scopes: `read_products`, `write_orders`, `read_price_rules`, `read_discounts`

---

## Tech Stack Summary
- **Server**: Node.js, Express 4, Prisma 5, PostgreSQL, JWT, bcryptjs, crypto-js (AES encryption for API tokens), axios
- **Dashboard**: Next.js 14 App Router, TypeScript, Tailwind CSS 3, react-hot-toast
- **Widget**: Vanilla JS, bundled with esbuild into single IIFE file
- **Payments**: SabPaisa (AES-CBC encrypted payload, redirect-based flow)
- **Deploy**: PM2 on VPS

---

## Database Models (Prisma)
- **User** — email, password (bcrypt hashed), name
- **Store** — name, shopifyUrl (unique), adminApiToken (AES encrypted), widgetKey (uuid, public)
- **StoreUser** — join table: userId + storeId + role (owner/admin)
- **DrawerConfig** — one per store, JSON columns per section (announcements, rewardBar, upsells, addons, notes, confirmation, discounts, trustBadges, freeGifts, settings, colors)
- **Order** — customer info, address (JSON), items (JSON), totals, paymentStatus, shopifyOrderId
