# Trial in the browser (GitHub Codespaces)

Nothing to install. Everything runs with demo data and test mode: no real WhatsApp, no real money, no Shopify.

1. Open https://github.com/AadityaAggarwal2007/checkout → switch to the branch **claude/flexype-plan**.
2. Green **Code** button → **Codespaces** tab → **Create codespace on claude/flexype-plan**.
3. Wait 5-8 minutes the first time (it installs everything). A terminal at the bottom then shows:
   `Store https://…-5004.app.github.dev` and `Dashboard https://…-5003.app.github.dev`.
4. If the terminal says "Make the ports public": open the **PORTS** tab, right-click 5002, 5003 and 5004 →
   **Port Visibility → Public**.
5. Open the **Store** link → open a product → **Add to cart** → the cart drawer opens → **Checkout**.
   - Mobile number: any 10-digit number starting 6-9. The code shows in yellow on the page ("Test mode").
   - Pincode 302001 / 110001 / 400001 / 560001 fill the city by themselves.
   - Online payment opens the **test gateway**: press **Pay** (or **Fail payment** to see a failure).
   - Orders "sent to Shopify" are listed at `<Store link>/dev-admin/orders`.
6. Open the **Dashboard** link: `owner@local.test` / `local-password` → Orders, Shipping, Settings › Payments,
   Cart drawer.

Stop: close the tab (the codespace stops by itself after 30 minutes idle). Next time open it again from
**Code → Codespaces**; run `bash scripts/codespace-start.sh` in the terminal if the links do not appear.
Public ports mean anyone with the link can open this demo — it holds only demo data.
