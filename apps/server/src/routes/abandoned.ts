import type { Cart } from '@checkout/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';
import { istDayStart } from './analytics.js';

/** A checkout counts as abandoned 30 minutes after the shopper's last step, with a verified phone and no order. */
const QUIET_MS = 30 * 60_000;
const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), page: z.coerce.number().int().min(1).max(500).default(1) });
const STEP_LABEL: Record<string, string> = { CART: 'Opened', LOGIN: 'Opened', ADDRESS: 'Phone verified', PAYMENT: 'At payment', PROCESSING: 'Payment started', COMPLETED: 'Completed' };

const cartOf = (json: unknown) => ((json ?? { lines: [] }) as Cart).lines ?? [];
const valueOf = (json: unknown) => cartOf(json).reduce((s, l) => s + l.unitPrice * l.quantity, 0);

/** Dashboard > Abandoned checkouts: who left with a verified phone, how far they got, what was in the cart. */
export function abandonedRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;
  const P = '/api/stores/:storeId/abandoned';
  const where = (storeId: string, days: number) => ({
    storeId,
    createdAt: { gte: istDayStart(days - 1) },
    contactPhone: { not: null },
    order: null,
    updatedAt: { lt: new Date(Date.now() - QUIET_MS) },
  });

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const q = query.safeParse(req.query);
    if (!q.success) throw badRequest('Check the filters.');
    const { days, page } = q.data;
    const [rows, count] = await Promise.all([
      prisma.checkoutSession.findMany({
        where: where(storeId, days),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, createdAt: true, updatedAt: true, contactPhone: true, contactName: true, step: true, cart: true, total: true, paymentMethod: true, customer: { select: { name: true } } },
      }),
      prisma.checkoutSession.count({ where: where(storeId, days) }),
    ]);
    return {
      count,
      checkouts: rows.map((r) => ({
        id: r.id,
        at: r.updatedAt.toISOString(),
        phone: r.contactPhone,
        name: r.customer?.name ?? r.contactName ?? null,
        step: STEP_LABEL[r.step] ?? r.step,
        items: cartOf(r.cart).reduce((s, l) => s + l.quantity, 0),
        value: r.total || valueOf(r.cart),
        paymentTried: r.paymentMethod,
      })),
    };
  });

  app.get(`${P}/:sessionId`, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId, sessionId } = req.params as { storeId: string; sessionId: string };
    const s = await prisma.checkoutSession.findFirst({
      where: { id: sessionId, storeId, order: null },
      include: { customer: { select: { name: true, email: true, orderCount: true } }, transactions: { select: { method: true, status: true, amount: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!s || !s.contactPhone) throw notFound('This checkout does not exist.');
    const address = s.address as { name?: string; line1?: string; city?: string; state?: string; pincode?: string } | null;
    return {
      checkout: {
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        phone: s.contactPhone,
        name: s.customer?.name ?? s.contactName ?? address?.name ?? null,
        email: s.contactEmail ?? s.customer?.email ?? null,
        repeat: (s.customer?.orderCount ?? 0) > 0,
        step: STEP_LABEL[s.step] ?? s.step,
        address: address ? { line1: address.line1, city: address.city, state: address.state, pincode: address.pincode } : null,
        lines: cartOf(s.cart).map((l) => ({ title: l.title, variantTitle: l.variantTitle, image: l.image, quantity: l.quantity, unitPrice: l.unitPrice })),
        value: s.total || valueOf(s.cart),
        coupons: ((s.couponState as { codes?: string[] } | null)?.codes ?? []),
        payments: s.transactions.map((t) => ({ method: t.method, status: t.status, amount: t.amount, at: t.createdAt.toISOString() })),
        source: (s.attribution as { utm?: Record<string, string> } | null)?.utm?.utm_source ?? null,
      },
    };
  });
}
