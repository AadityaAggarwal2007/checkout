import { checkoutSettingsSchema, drawerSettingsSchema } from '@checkout/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { logActivity } from '../lib/activity.js';
import { notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

/** The maroon & gold look of the Shiprocket checkouts the owner showed (colours read from the reference). */
export const SHIPROCKET_LOOK = {
  drawerColors: { primary: '#540812', buttonText: '#FFFFFF', background: '#FFF7ED', accent: '#16A34A', highlight: '#AC6E0D' },
  checkoutColors: { primary: '#540812', primaryText: '#FFFFFF', accent: '#16A34A' },
};

/**
 * Dashboard home > "Make it look like Shiprocket": one click sets the active cart drawer and the checkout
 * to that look. Only looks and wording: offers, gifts, prices and payment settings are not touched.
 */
export function quickSetupRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  app.post('/api/stores/:storeId/quick-setup/shiprocket-look', { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const drawer = await prisma.drawerConfig.findFirst({ where: { storeId, isActive: true } });
    if (!drawer) throw notFound('No active cart drawer.');
    const d = drawerSettingsSchema.parse(drawer.config ?? {});
    const messages = d.announcements.messages.length ? d.announcements.messages : ['Buy 1 Get 1 Free'];
    const nextDrawer = drawerSettingsSchema.parse({
      ...d,
      colors: SHIPROCKET_LOOK.drawerColors,
      timer: { ...d.timer, enabled: true },
      announcements: { ...d.announcements, enabled: true, mode: 'marquee', messages },
      discountCodes: { ...d.discountCodes, enabled: true, placeholder: 'Enter coupon code' },
      upsells: { ...d.upsells, title: 'You may also like' },
      trustBadges: { ...d.trustBadges, enabled: false },
      settings: { ...d.settings, checkoutText: 'Buy Now', buttonTag: d.settings.buttonTag || 'Limited Offer' },
    });
    const row = await prisma.checkoutConfig.findUnique({ where: { storeId } });
    const c = checkoutSettingsSchema.parse(row?.config ?? {});
    const nextCheckout = checkoutSettingsSchema.parse({ ...c, colors: SHIPROCKET_LOOK.checkoutColors });
    await prisma.$transaction([
      prisma.drawerConfig.update({ where: { id: drawer.id }, data: { config: nextDrawer as unknown as Prisma.InputJsonValue, version: { increment: 1 } } }),
      prisma.checkoutConfig.upsert({
        where: { storeId },
        create: { storeId, config: nextCheckout as unknown as Prisma.InputJsonValue },
        update: { config: nextCheckout as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      }),
    ]);
    await logActivity(app, storeId, req.user!.id, 'quick-setup', 'Applied the Shiprocket look to the cart drawer and checkout');
    return { ok: true };
  });
}
