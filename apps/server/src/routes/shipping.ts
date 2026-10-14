import { misleadingFreeName } from '@checkout/core';
import { shippingSchema, type ShippingSettings } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { logActivity } from '../lib/activity.js';
import { badRequest } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/shipping';

/** Settings > Shipping: zones of states, rates with slabs (charge + COD allowed), blocked pincodes. */
export function shippingRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  async function read(storeId: string): Promise<{ shipping: ShippingSettings; warnings: string[] }> {
    const zones = await prisma.shippingZone.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      include: { rates: { orderBy: { sort: 'asc' }, include: { slabs: { orderBy: { min: 'asc' } }, blockedPincodes: { select: { pincode: true } } } } },
    });
    const shipping: ShippingSettings = {
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        states: z.states,
        rates: z.rates.map((r) => ({
          id: r.id,
          name: r.name,
          eta: r.eta,
          basis: r.basis,
          active: r.active,
          slabs: r.slabs.map((s) => ({ min: s.min, max: s.max, charge: s.charge, codAllowed: s.codAllowed })),
          blockedPincodes: r.blockedPincodes.map((b) => b.pincode),
        })),
      })),
    };
    return { shipping, warnings: warningsOf(shipping) };
  }

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => read((req.params as { storeId: string }).storeId));

  /** Saves the whole shipping setup at once (it is small; one transaction keeps it consistent). */
  app.put(P, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as { storeId: string };
    const parsed = shippingSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Check the shipping settings.');
    await prisma.$transaction(async (tx) => {
      await tx.shippingZone.deleteMany({ where: { storeId } });
      for (const z of parsed.data.zones) {
        await tx.shippingZone.create({
          data: {
            storeId,
            name: z.name,
            states: z.states,
            rates: {
              create: z.rates.map((r, i) => ({
                name: r.name,
                eta: r.eta,
                basis: r.basis,
                active: r.active,
                sort: i,
                slabs: { create: r.slabs.map((s) => ({ min: s.min, max: s.max, charge: s.charge, codAllowed: s.codAllowed })) },
                blockedPincodes: { create: [...new Set(r.blockedPincodes)].map((pincode) => ({ pincode })) },
              })),
            },
          },
        });
      }
    });
    await logActivity(app, storeId, req.user!.id, 'shipping.update', 'Updated shipping rates');
    return read(storeId);
  });
}

/** Rule 7: a rate called "free" that charges money in some slab misleads shoppers. */
export function warningsOf(s: ShippingSettings): string[] {
  const out: string[] = [];
  for (const z of s.zones)
    for (const r of z.rates) {
      const asCore = { id: r.id ?? '', name: r.name, basis: r.basis === 'WEIGHT' ? ('weight' as const) : ('price' as const), active: r.active, slabs: r.slabs.map((x) => ({ ...x, max: x.max ?? undefined })) };
      if (misleadingFreeName(asCore)) out.push(`"${r.name}" is called free but charges money in some slabs. Shoppers see "Shipping ₹…" there, never "Free".`);
      if (r.slabs[0] && r.slabs.reduce((m, x) => Math.min(m, x.min), Infinity) > 0) out.push(`"${r.name}" has no slab from 0: smaller orders cannot be shipped.`);
    }
  if (s.zones.length && !s.zones.some((z) => z.states.length === 0)) out.push('No zone covers "all other states": addresses outside your zones cannot order.');
  return out;
}
