import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { logActivity } from '../lib/activity.js';
import { notFound } from '../lib/errors.js';
import { pushOrderToShopify } from '../orders/create.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/orders';

/** Orders placed through our checkout (newest first, 50 a page, search by number / phone / name). */
export function orderRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const q = req.query as { q?: string; mode?: string; cursor?: string };
    const where: Prisma.OrderWhereInput = { storeId };
    const text = q.q?.trim().slice(0, 60);
    if (text) {
      const digits = text.replace(/\D/g, '');
      where.OR = [
        { number: { contains: text.toUpperCase() } },
        { shopifyName: { contains: text } },
        { contactName: { contains: text, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ contactPhone: { contains: digits } }] : []),
      ];
    }
    if (q.mode === 'PREPAID' || q.mode === 'COD' || q.mode === 'PARTIAL_COD') where.paymentMode = q.mode;
    const rows = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        number: true,
        shopifyName: true,
        shopifyError: true,
        createdAt: true,
        contactName: true,
        contactPhone: true,
        paymentMode: true,
        paymentStatus: true,
        paymentMethod: true,
        total: true,
        paidAmount: true,
        dueOnDelivery: true,
        _count: { select: { lines: true } },
      },
    });
    return { orders: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  });

  app.get(`${P}/:orderId`, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId, orderId } = req.params as { storeId: string; orderId: string };
    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        lines: true,
        transactions: { orderBy: { createdAt: 'asc' }, select: { id: true, provider: true, method: true, status: true, amount: true, merchantRef: true, gatewayRef: true, verifiedAt: true, createdAt: true } },
        redemptions: { include: { coupon: { select: { code: true, title: true } } } },
        usageCharge: { select: { amount: true, rateBps: true, status: true } },
        session: { select: { createdAt: true, source: true } },
      },
    });
    if (!order) throw notFound('Order not found.');
    // Failed attempts of the same checkout, for support ("paid twice?").
    const attempts = await prisma.paymentTransaction.findMany({
      where: { sessionId: order.sessionId, storeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, provider: true, method: true, status: true, amount: true, createdAt: true },
    });
    const { pricing: _pricing, ...rest } = order;
    return { order: rest, attempts };
  });

  app.post(`${P}/:orderId/push-shopify`, { preHandler: requireStore('STAFF') }, async (req) => {
    const { storeId, orderId } = req.params as { storeId: string; orderId: string };
    const order = await prisma.order.findFirst({ where: { id: orderId, storeId } });
    if (!order) throw notFound('Order not found.');
    await pushOrderToShopify(prisma, app.deps.orderSink, order.id);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { shopifyName: true, shopifyError: true } });
    await logActivity(app, storeId, req.user!.id, 'order.push', `Sent order ${order.number} to Shopify again`, order.id);
    return after;
  });
}
