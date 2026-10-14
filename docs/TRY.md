# Trial in the browser (GitHub Codespaces)

Nothing to install. Everything runs with demo data and test mode: no real WhatsApp, no real money, no Shopify.

1. Logged in to GitHub, open this link and press **Create codespace**:
   https://codespaces.new/AadityaAggarwal2007/checkout/tree/claude/flexype-plan?quickstart=1
2. Wait 5-8 minutes the first time (it installs everything). The terminal at the bottom then prints
   `Store https://…-5004.app.github.dev` and `Dashboard https://…-5003.app.github.dev` — Ctrl/Cmd-click them.
3. **Store**: open a product → **Add to cart** → the cart drawer opens → **Checkout**.
   - Mobile number: any 10-digit number starting 6-9. The code shows in yellow on the page ("Test mode").
   - Pincode 302001 / 110001 / 400001 / 560001 fill the city by themselves.
   - Online payment opens the **test gateway**: press **Pay** (or **Fail payment** to see a failure).
   - Orders "sent to Shopify" are listed at `<Store link>/dev-admin/orders`.
4. **Dashboard**: `owner@local.test` / `local-password` → Orders, Shipping, Settings › Payments, Cart drawer.

The links open only for your GitHub login (ports stay private). The codespace stops by itself after
30 idle minutes; open the same link again next time (it reuses it). If the links do not appear, run
`bash scripts/codespace-start.sh` in the terminal.
