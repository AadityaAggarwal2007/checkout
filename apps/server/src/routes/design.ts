import { checkoutSettingsSchema, type CheckoutSettings } from '@checkout/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { logActivity } from '../lib/activity.js';
import { badRequest } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/checkout-design';

/** Dashboard > Checkout design: logo, colours, banners, payment list, trust badges, exit popup. */
export function designRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  async function read(storeId: string): Promise<{ settings: CheckoutSettings; exitAnswers: Array<{ reason: string; count: number }> }> {
    const [row, answers] = await Promise.all([
      prisma.checkoutConfig.findUnique({ where: { storeId } }),
      prisma.exitSurveyResponse.groupBy({ by: ['reason'], where: { storeId, createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }, _count: true, orderBy: { _count: { reason: 'desc' } }, take: 10 }),
    ]);
    const parsed = checkoutSettingsSchema.safeParse(row?.config ?? {});
    return { settings: parsed.success ? parsed.data : checkoutSettingsSchema.parse({}), exitAnswers: answers.map((a) => ({ reason: a.reason, count: a._count })) };
  }

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => read((req.params as { storeId: string }).storeId));

  app.put(P, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const parsed = checkoutSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw badRequest(i ? `${i.path.join(' › ') || 'Settings'}: ${i.message}` : 'Check the settings.');
    }
    const s = parsed.data;
    if (new Set(s.methodOrder).size !== s.methodOrder.length) throw badRequest('Each payment method can be listed once.');
    const config = s as unknown as Prisma.InputJsonValue;
    await prisma.checkoutConfig.upsert({ where: { storeId }, create: { storeId, config }, update: { config, version: { increment: 1 } } });
    await logActivity(app, storeId, req.user!.id, 'checkout.design', 'Updated the checkout design');
    return read(storeId);
  });
}
