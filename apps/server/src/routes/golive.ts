import type { FastifyInstance } from 'fastify';
import { requireStore } from '../plugins/auth.js';

export interface GoLiveItem {
  key: string;
  ok: boolean;
  title: string;
  /** What to do when it is not done yet (plain words). */
  todo: string;
  /** Dashboard page that fixes it, relative to the store ("/settings/payments"); none = server setting. */
  href?: string;
  /** Needs the server's settings (keys in /etc/checkout/checkout.env), not the dashboard. */
  server?: boolean;
}

/** Dashboard > Go-live: what must be true before real shoppers use the checkout. Read-only. */
export function goLiveRoutes(app: FastifyInstance): void {
  const { prisma, env } = app.deps;

  app.get('/api/stores/:storeId/go-live', { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const [settings, gateways, shopify, zones, live] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { storeId } }),
      prisma.gatewayAccount.findMany({ where: { storeId, active: true }, select: { provider: true, mode: true } }),
      prisma.shopifyConnection.findUnique({ where: { storeId } }),
      prisma.shippingZone.count({ where: { storeId } }),
      prisma.order.count({ where: { storeId, NOT: { shopifyOrderId: null } } }),
    ]);
    const real = gateways.filter((g) => g.provider !== 'DEV');
    const items: GoLiveItem[] = [
      { key: 'whatsapp', ok: env.OTP_SENDER === 'whatsapp', title: 'WhatsApp OTP is real', todo: 'Add the WhatsApp Business keys (token, phone number id, approved OTP template) on the server.', server: true },
      // A connected store reads Shopify and gets Shopify orders on every server (the demo one routes per store).
      { key: 'shopify', ok: !!shopify?.accessTokenEnc && !shopify.uninstalledAt, title: 'Shopify app connected', todo: 'Install our Shopify app on the store so prices come from Shopify and orders are created there.' },
      { key: 'embed', ok: !!shopify?.embedSeenAt && Date.now() - shopify.embedSeenAt.getTime() < 2 * 86_400_000, title: 'Cart drawer is on the store', todo: 'Shopify admin → Themes → Customize → App embeds → switch on Cart drawer.' },
      { key: 'gateway', ok: real.length > 0, title: 'A payment gateway is connected', todo: 'Add PayU or PayGlocal keys in Settings → Payments.', href: '/settings/payments' },
      { key: 'gateway_live', ok: real.some((g) => g.mode === 'live'), title: 'Gateway in live mode', todo: 'Switch the gateway from test to live keys once a test payment worked.', href: '/settings/payments' },
      { key: 'test_gateway_off', ok: env.DEV_GATEWAY === '0', title: 'Test gateway switched off', todo: 'The server still allows the test gateway (DEV_GATEWAY=1).', server: true },
      { key: 'shipping', ok: zones > 0, title: 'Shipping rates set', todo: 'Add at least one zone and rate in Shipping.', href: '/shipping' },
      { key: 'test_order', ok: live > 0, title: 'A test order reached Shopify', todo: 'Use the test link (Settings → Payments) to place one COD and one paid order, and check them in Shopify.', href: '/settings/payments' },
      { key: 'enabled', ok: !!settings?.checkoutEnabled, title: 'Checkout switched on for shoppers', todo: 'Last step: switch on "Our checkout on your store" in Settings → Payments.', href: '/settings/payments' },
    ];
    return { items, ready: items.every((i) => i.ok) };
  });
}
