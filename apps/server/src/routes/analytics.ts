import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const IST_MS = 5.5 * 3600_000;
/** Start of the India day `daysAgo` days before today, as a UTC Date. */
export function istDayStart(daysAgo: number, now = Date.now()): Date {
  const ist = now + IST_MS;
  return new Date(ist - (ist % 86_400_000) - daysAgo * 86_400_000 - IST_MS);
}

const query = z.object({ days: z.coerce.number().int().refine((d) => [1, 7, 30, 90].includes(d)).default(7) });
const n = (v: unknown) => Number(v ?? 0);

/** Dashboard home: sales, orders, AOV, the checkout funnel, payment mix, coupons, sources, exit reasons. */
export function analyticsRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  app.get('/api/stores/:storeId/analytics', { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const q = query.safeParse(req.query);
    if (!q.success) throw badRequest('Choose today, 7, 30 or 90 days.');
    const { days } = q.data;
    const from = istDayStart(days - 1);
    const live = { storeId, createdAt: { gte: from }, cancelledAt: null };

    const [totals, byDay, byMode, coupons, sources, sessions, exits, abandoned] = await Promise.all([
      prisma.order.aggregate({ where: live, _sum: { total: true, discount: true }, _count: true }),
      prisma.$queryRaw<Array<{ day: Date; orders: bigint; sales: bigint }>>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS day, count(*) AS orders, coalesce(sum(total), 0) AS sales
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${from} AND "cancelledAt" IS NULL GROUP BY 1 ORDER BY 1`,
      prisma.order.groupBy({ by: ['paymentMode'], where: live, _count: true, _sum: { total: true } }),
      prisma.$queryRaw<Array<{ code: string; orders: bigint; sales: bigint; discount: bigint }>>`
        SELECT code, count(*) AS orders, coalesce(sum(total), 0) AS sales, coalesce(sum(discount), 0) AS discount
        FROM "Order", unnest("couponCodes") AS code
        WHERE "storeId" = ${storeId} AND "createdAt" >= ${from} AND "cancelledAt" IS NULL GROUP BY code ORDER BY 2 DESC LIMIT 10`,
      prisma.$queryRaw<Array<{ source: string; orders: bigint; sales: bigint }>>`
        SELECT coalesce(nullif(attribution->'utm'->>'utm_source', ''), CASE WHEN attribution->>'fbclid' IS NOT NULL THEN 'facebook' ELSE 'direct' END) AS source,
               count(*) AS orders, coalesce(sum(total), 0) AS sales
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${from} AND "cancelledAt" IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      prisma.$queryRaw<Array<{ opened: bigint; verified: bigint; address: bigint; paying: bigint; ordered: bigint }>>`
        SELECT count(*) AS opened,
               count(*) FILTER (WHERE s.step IN ('ADDRESS','PAYMENT','PROCESSING','COMPLETED')) AS verified,
               count(*) FILTER (WHERE s.step IN ('PAYMENT','PROCESSING','COMPLETED')) AS address,
               count(*) FILTER (WHERE o.id IS NOT NULL OR EXISTS (SELECT 1 FROM "PaymentTransaction" t WHERE t."sessionId" = s.id)) AS paying,
               count(o.id) AS ordered
        FROM "CheckoutSession" s LEFT JOIN "Order" o ON o."sessionId" = s.id
        WHERE s."storeId" = ${storeId} AND s."createdAt" >= ${from}`,
      prisma.exitSurveyResponse.groupBy({ by: ['reason'], where: { storeId, createdAt: { gte: from } }, _count: true, orderBy: { _count: { reason: 'desc' } }, take: 6 }),
      prisma.checkoutSession.count({ where: { storeId, createdAt: { gte: from }, contactPhone: { not: null }, order: null, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
    ]);

    const orders = totals._count;
    const sales = totals._sum.total ?? 0;
    const f = sessions[0];
    return {
      days,
      from: from.toISOString(),
      sales,
      orders,
      aov: orders ? Math.round(sales / orders) : 0,
      discount: totals._sum.discount ?? 0,
      abandoned,
      byDay: byDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), orders: n(d.orders), sales: n(d.sales) })),
      byMode: byMode.map((m) => ({ mode: m.paymentMode, orders: m._count, sales: m._sum.total ?? 0 })),
      funnel: [
        { step: 'Checkout opened', count: n(f?.opened) },
        { step: 'Phone verified', count: n(f?.verified) },
        { step: 'Address added', count: n(f?.address) },
        { step: 'Payment started', count: n(f?.paying) },
        { step: 'Order placed', count: n(f?.ordered) },
      ],
      coupons: coupons.map((c) => ({ code: c.code, orders: n(c.orders), sales: n(c.sales), discount: n(c.discount) })),
      sources: sources.map((s) => ({ source: s.source, orders: n(s.orders), sales: n(s.sales) })),
      exitReasons: exits.map((e) => ({ reason: e.reason, count: e._count })),
    };
  });
}
