# Shopify app (install + theme app embed)

Owner decision: all settings live in our dashboard; this app only installs (OAuth), switches the drawer on
through a theme app embed, and sends webhooks. Nothing to configure inside Shopify admin.

## One-time setup (needs a Shopify Partner account)

1. partners.shopify.com > Apps > Create app > Create manually. Copy the Client ID and secret into the server's
   `.env` as `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` (never into Git).
2. Replace `REPLACE_WITH_SHOPIFY_API_KEY` and `REPLACE_WITH_PUBLIC_URL` in `shopify.app.toml` and in
   `extensions/cart-drawer/blocks/app-embed.liquid` (server_url default).
3. `npx @shopify/cli app deploy` from this folder (pushes the app config + the theme extension).
4. Install on a dev store via the app's install link; the merchant lands in our dashboard.
5. Theme editor > App embeds > switch on "Cart drawer" > Save.

The store is identified on the storefront by `shop.permanent_domain`, so no key needs pasting.
