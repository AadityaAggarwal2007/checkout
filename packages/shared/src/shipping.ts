import { z } from 'zod';

/** Settings > Shipping (only in our dashboard, owner 2026-10-14). Amounts in paise, weights in grams. */
export const shippingSlabSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(1).nullable().default(null),
  charge: z.number().int().min(0).max(10_000_00),
  codAllowed: z.boolean().default(true),
});

export const shippingRateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the rate').max(60),
  eta: z.string().trim().max(60).nullable().default(null),
  basis: z.enum(['PRICE', 'WEIGHT']).default('PRICE'),
  active: z.boolean().default(true),
  slabs: z.array(shippingSlabSchema).min(1, 'Add at least one slab').max(20),
  blockedPincodes: z.array(z.string().regex(/^[1-9]\d{5}$/, 'Pincodes have 6 digits')).max(20_000).default([]),
});

export const shippingZoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name the zone').max(60),
  /** Empty = every state no other zone covers. */
  states: z.array(z.string()).default([]),
  rates: z.array(shippingRateSchema).max(10),
});

export const shippingSchema = z
  .object({ zones: z.array(shippingZoneSchema).max(40) })
  .superRefine((cfg, ctx) => {
    cfg.zones.forEach((zone, zi) =>
      zone.rates.forEach((rate, ri) => {
        const slabs = [...rate.slabs].sort((a, b) => a.min - b.min);
        slabs.forEach((s, si) => {
          if (s.max !== null && s.max <= s.min) ctx.addIssue({ code: 'custom', path: ['zones', zi, 'rates', ri, 'slabs', si], message: `${rate.name}: each slab's "to" must be above its "from"` });
          const next = slabs[si + 1];
          if (next && (s.max === null || s.max > next.min)) ctx.addIssue({ code: 'custom', path: ['zones', zi, 'rates', ri, 'slabs'], message: `${rate.name}: slabs overlap` });
        });
      }),
    );
    const seen = new Map<string, string>();
    for (const z of cfg.zones)
      for (const st of z.states) {
        if (seen.has(st)) ctx.addIssue({ code: 'custom', path: ['zones'], message: `${st} is in two zones (${seen.get(st)} and ${z.name})` });
        seen.set(st, z.name);
      }
  });
export type ShippingSettings = z.infer<typeof shippingSchema>;
