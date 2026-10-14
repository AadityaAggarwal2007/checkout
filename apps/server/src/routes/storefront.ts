import { price, type Cart } from '@checkout/core';
import {
  drawerSettingsSchema,
  priceRequestSchema,
  type PriceResponse,
  type StorefrontConfig,
} from '@checkout/shared';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '../lib/errors.js';
import { normaliseShop } from '../lib/shopify.js';
import { isTestKey } from '../checkout/service.js';
import { toCoreCoupon } from '../rules/coupons.js';

/**
 * Public API for the storefront script. No cookies, no personal data: config and prices only,
 * so any origin may call it (CORS *). Every call needs the store's public widget key.
 */
export function storefrontRoutes(app: FastifyInstance): void {
  const { prisma, catalog } = app.deps;

  /** The store is named by its widget key (manual install) or its *.myshopify.com domain (app embed). */
  async function storeByKey(req: FastifyRequest) {
    const { key, shop } = req.query as { key?: string; shop?: string };
    const shopDomain = normaliseShop(shop);
    if ((!key || key.length > 64) && !shopDomain) throw badRequest('Missing store key.');
    const store = key ? await prisma.store.findUnique({ where: { widgetKey: key } }) : await prisma.store.findUnique({ where: { shopDomain: shopDomain! } });
    if (!store || store.status === 'UNINSTALLED' || store.status === 'PAUSED') throw notFound('Store not found.');
    return store;
  }

  const open = (reply: FastifyReply) => reply.header('access-control-allow-origin', '*').header('vary', 'origin');

  app.options('/storefront/*', async (_req, reply) =>
    open(reply)
      .header('access-control-allow-methods', 'GET, POST, OPTIONS')
      .header('access-control-allow-headers', 'content-type')
      .header('access-control-max-age', '86400')
      .code(204)
      .send(),
  );

  /** The storefront script itself (built by apps/storefront). Cached 5 min by browsers / CDN. */
  let script: Buffer | undefined;
  app.get('/storefront/loader.js', async (_req, reply) => {
    if (!script || app.deps.env.NODE_ENV === 'development') {
      script = await readFile(app.deps.env.STOREFRONT_DIST).catch(() => undefined);
    }
    if (!script) return reply.code(404).send('// storefront not built');
    return open(reply)
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', app.deps.env.NODE_ENV === 'development' ? 'no-store' : 'public, max-age=300')
      .send(script);
  });

  /** Page the dashboard puts in an iframe for the live preview (the real drawer, sample cart). */
  app.get('/storefront/preview', async (_req, reply) =>
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('content-security-policy', `default-src 'self'; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors ${app.deps.env.DASHBOARD_URL}`)
      .send(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>html,body{margin:0;height:100%;background:#E9E9EC}</style></head><body>' +
          '<script src="/storefront/loader.js" data-key="preview" data-preview></script></body></html>',
      ),
  );

  app.get('/storefront/config', async (req, reply) => {
    const store = await storeByKey(req);
    const drawer =
      (await prisma.drawerConfig.findFirst({ where: { storeId: store.id, isActive: true } })) ??
      (await prisma.drawerConfig.findFirst({ where: { storeId: store.id }, orderBy: { createdAt: 'asc' } }));
    const coupons = await prisma.coupon.findMany({
      where: { storeId: store.id, active: true, visible: true, deletedAt: null, code: { not: null } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: { code: true, title: true },
      take: 20,
    });
    // Our checkout once the merchant switched it on; before that only with the merchant's test link.
    const { test } = req.query as { test?: string };
    const settings = await prisma.storeSettings.findUnique({ where: { storeId: store.id } });
    const testing = isTestKey(app.deps.env.HASH_PEPPER, store.id, test);
    const popup = settings?.checkoutEnabled || testing;
    const body: StorefrontConfig = {
      storeName: store.name,
      version: drawer?.version ?? 0,
      drawer: drawerSettingsSchema.parse(drawer?.config ?? {}),
      visibleCodes: coupons.map((c) => ({ code: c.code!, title: c.title ?? undefined })),
      checkout: popup ? { mode: 'popup', url: app.deps.env.CHECKOUT_URL ?? app.deps.env.PUBLIC_URL } : { mode: 'shopify' },
    };
    // Mark the embed as seen (dashboard shows "drawer is live"), at most once a minute.
    void prisma.shopifyConnection
      .updateMany({ where: { storeId: store.id, OR: [{ embedSeenAt: null }, { embedSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { embedSeenAt: new Date() } })
      .catch(() => undefined);
    return open(reply).header('cache-control', testing ? 'no-store' : 'public, max-age=30').send(body);
  });

  app.post('/storefront/price', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const store = await storeByKey(req);
    const body = priceRequestSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid cart.');
    const variants = await catalog.variants(store.id, body.data.lines.map((l) => l.variantId));
    const lines = body.data.lines.filter((l) => variants.has(l.variantId));
    const cart: Cart = {
      currency: 'INR',
      lines: lines.map((l) => {
        const v = variants.get(l.variantId)!;
        return {
          lineId: l.lineId,
          productId: v.productId,
          variantId: v.variantId,
          collectionIds: v.collectionIds,
          title: v.productTitle,
          variantTitle: v.title,
          image: v.image,
          quantity: l.quantity,
          unitPrice: v.price,
          compareAtPrice: v.compareAtPrice,
          weightGrams: v.weightGrams,
        };
      }),
    };
    const rows = await prisma.coupon.findMany({ where: { storeId: store.id, active: true, deletedAt: null } });
    const result = price({ cart, coupons: rows.map(toCoreCoupon), enteredCodes: body.data.codes });
    // Gift pictures and titles come from the catalog too (the coupon may only hold the variant id).
    const giftInfo = result.gifts.length ? await catalog.variants(store.id, result.gifts.map((g) => g.variantId)) : new Map();

    const groups: Record<string, string> = {};
    const applied = result.applied.map((a) => {
      const label = `${a.code ?? a.title ?? 'Offer'} applied!`;
      const ids = result.lines.flatMap((l) => l.groupIds).filter((g) => g.startsWith(`${a.couponId}#`));
      for (const g of ids) groups[g] = label;
      return { code: a.code, title: a.title, kind: a.kind, amount: a.amount, automatic: a.automatic };
    });
    const response: PriceResponse = {
      lines: result.lines.map((l) => ({ ...l, compareAtPrice: variants.get(l.variantId)?.compareAtPrice })),
      gifts: result.gifts.map((g) => {
        const v = giftInfo.get(g.variantId);
        return { variantId: g.variantId, title: v?.productTitle ?? g.title, image: g.image ?? v?.image, unitPrice: v?.price ?? g.unitPrice, quantity: g.quantity };
      }),
      subtotal: result.subtotal,
      discount: result.discount,
      total: result.merchandiseTotal,
      savings: result.savings.compareAt + result.savings.discounts + result.savings.gifts,
      applied,
      rejected: result.rejected.map((r) => ({ code: r.code, message: r.message })),
      groups,
    };
    return open(reply).header('cache-control', 'no-store').send(response);
  });

  /** Products for the drawer's "Products you may like". */
  app.get('/storefront/upsells', async (req, reply) => {
    const store = await storeByKey(req);
    const drawer = await prisma.drawerConfig.findFirst({ where: { storeId: store.id, isActive: true } });
    const settings = drawerSettingsSchema.parse(drawer?.config ?? {});
    if (!settings.upsells.enabled || settings.upsells.productIds.length === 0) return open(reply).send({ products: [] });
    const products = await catalog.products(store.id, settings.upsells.productIds.slice(0, settings.upsells.max));
    return open(reply)
      .header('cache-control', 'public, max-age=60')
      .send({
        products: products
          .map((p) => {
            const v = p.variants.find((x) => x.available) ?? p.variants[0];
            if (!v) return null;
            return { productId: p.productId, handle: p.handle, title: p.title, image: p.image ?? v.image, variantId: v.variantId, price: v.price, compareAtPrice: v.compareAtPrice, options: p.variants.length };
          })
          .filter(Boolean),
      });
  });
}
