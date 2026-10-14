import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict } from '../lib/errors.js';
import { requireStore, requireUser } from '../plugins/auth.js';

export function storeRoutes(app: FastifyInstance): void {
  app.get('/api/stores/:storeId', { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const store = await app.deps.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        domain: true,
        shopDomain: true,
        status: true,
        widgetKey: true,
        currency: true,
        createdAt: true,
        shopify: { select: { scopes: true, installedAt: true, uninstalledAt: true, embedSeenAt: true } },
      },
    });
    return { store, role: req.member?.role ?? 'OWNER' };
  });

  /**
   * After a Shopify install the merchant may not be logged in to our dashboard yet. The OAuth
   * callback hands out a short signed "claim" token; once logged in (or signed up) the dashboard
   * posts it here. A store can be claimed only while it has no owner.
   */
  app.post('/api/stores/claim', { preHandler: requireUser }, async (req) => {
    const body = z.object({ token: z.string().min(10) }).safeParse(req.body);
    if (!body.success) throw badRequest('Missing claim token.');
    const { tokens, prisma } = app.deps;
    const claim = await tokens.verify<{ storeId: string }>('store_claim', body.data.token);
    if (!claim) throw badRequest('This link has expired. Open the app from Shopify again.', 'claim_expired');
    return prisma.$transaction(async (tx) => {
      const owner = await tx.storeMember.findFirst({ where: { storeId: claim.storeId, role: 'OWNER' } });
      if (owner && owner.userId !== req.user!.id) throw conflict('This store is already connected to another account.', 'store_owned');
      if (!owner) {
        await tx.storeMember.create({ data: { storeId: claim.storeId, userId: req.user!.id, role: 'OWNER' } });
        await tx.activityLog.create({
          data: { storeId: claim.storeId, userId: req.user!.id, action: 'store.claim', summary: 'Connected the store' },
        });
      }
      return { storeId: claim.storeId };
    });
  });
}
