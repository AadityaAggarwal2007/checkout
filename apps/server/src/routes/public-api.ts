import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError, badRequest } from '../lib/errors.js';
import { API_KEY_PREFIX, apiKeyHash } from './settings.js';

/**
 * Read-only API for the merchant's own systems (Settings > API keys):
 *   GET /api/v1/orders?since=<ISO>&cursor=<id>   Authorization: Bearer ck_live_…
 */
export function publicApiRoutes(app: FastifyInstance): void {
  const { prisma, env } = app.deps;

  async function storeOf(req: FastifyRequest): Promise<string> {
    const header = String(req.headers.authorization ?? '');
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const row = key.startsWith(API_KEY_PREFIX) && key.length < 100 ? await prisma.apiKey.findUnique({ where: { keyHash: apiKeyHash(env.HASH_PEPPER, key) } }) : null;
    if (!row || row.revokedAt) throw new HttpError(401, 'unauthorized', 'Invalid or revoked API key.');
    if (!row.lastUsedAt || row.lastUsedAt.getTime() < Date.now() - 60_000) void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return row.storeId;
  }

  const query = z.object({ since: z.string().datetime().optional(), cursor: z.string().max(40).optional() });
  app.get('/api/v1/orders', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const storeId = await storeOf(req);
    const q = query.safeParse(req.query);
    if (!q.success) throw badRequest('since must be an ISO date.');
    const rows = await prisma.order.findMany({
      where: { storeId, ...(q.data.since ? { createdAt: { gte: new Date(q.data.since) } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(q.data.cursor ? { cursor: { id: q.data.cursor }, skip: 1 } : {}),
      include: { lines: { select: { productId: true, variantId: true, title: true, variantTitle: true, sku: true, quantity: true, unitPrice: true } } },
    });
    return {
      orders: rows.slice(0, 50).map((o) => ({
        id: o.id,
        number: o.number,
        shopifyName: o.shopifyName,
        createdAt: o.createdAt.toISOString(),
        paymentMode: o.paymentMode,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        cancelled: !!o.cancelledAt,
        contact: { name: o.contactName, phone: o.contactPhone, email: o.contactEmail },
        shippingAddress: o.shippingAddress,
        amounts: { subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, codFee: o.codFee, total: o.total, paid: o.paidAmount, dueOnDelivery: o.dueOnDelivery, currency: 'INR', unit: 'paise' },
        couponCodes: o.couponCodes,
        lines: o.lines,
      })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  });
}
