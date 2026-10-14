import type { Cart, CodSettings, Coupon, RtoSettings, ShippingConfig, ShopperContext, UsageCounts } from '@checkout/core';
import type { Customer, PrismaClient, StoreSettings } from '@prisma/client';
import type { Catalog } from '../catalog/types.js';
import { toCoreCoupon } from '../rules/coupons.js';

/** Everything the pricing engine needs from the database for one store. */
export interface StoreRules {
  settings: StoreSettings;
  coupons: Coupon[];
  shipping: ShippingConfig;
  cod: CodSettings;
  rto: RtoSettings;
}

export function codSettingsOf(s: StoreSettings): CodSettings {
  return {
    codEnabled: s.codEnabled,
    codFee: s.codFee,
    partial: {
      enabled: s.partialCodEnabled,
      advance: s.partialCodType === 'percent' ? { type: 'percent', percent: s.partialCodValue / 100 } : { type: 'fixed', amount: s.partialCodValue },
      minAdvance: s.partialCodMin ?? undefined,
      maxAdvance: s.partialCodMax ?? undefined,
    },
  };
}

export async function loadStoreRules(prisma: PrismaClient, storeId: string): Promise<StoreRules> {
  const [settings, couponRows, zones, rtoSettings, rtoRules] = await Promise.all([
    prisma.storeSettings.upsert({ where: { storeId }, create: { storeId }, update: {} }),
    prisma.coupon.findMany({ where: { storeId, active: true, deletedAt: null } }),
    prisma.shippingZone.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      include: { rates: { orderBy: { sort: 'asc' }, include: { slabs: { orderBy: { min: 'asc' } }, blockedPincodes: true } } },
    }),
    prisma.rtoSettings.findUnique({ where: { storeId } }),
    prisma.rtoRule.findMany({ where: { storeId, active: true } }),
  ]);
  return {
    settings,
    coupons: couponRows.map(toCoreCoupon),
    shipping: {
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        states: z.states,
        rates: z.rates.map((r) => ({
          id: r.id,
          name: r.name,
          eta: r.eta ?? undefined,
          basis: r.basis === 'WEIGHT' ? 'weight' : 'price',
          active: r.active,
          slabs: r.slabs.map((s) => ({ min: s.min, max: s.max ?? undefined, charge: s.charge, codAllowed: s.codAllowed })),
          blockedPincodes: r.blockedPincodes.map((b) => b.pincode),
        })),
      })),
    },
    cod: codSettingsOf(settings),
    rto: {
      mode: rtoSettings?.mode === 'single' ? 'single' : 'all',
      rules: rtoRules.map((r) => ({
        id: r.id,
        active: r.active,
        priority: r.priority,
        when: r.condition as unknown as RtoSettings['rules'][number]['when'],
        then: { blockCod: r.blockCod, blockPartialCod: r.blockPartialCod },
      })),
    },
  };
}

export function shopperOf(c: Customer | null | undefined): ShopperContext {
  if (!c) return {};
  return {
    phone: c.phone,
    orderCount: c.orderCount,
    codOrderCount: c.codOrderCount,
    returnedOrderCount: c.returnedCount,
    lifetimeSpend: c.lifetimeSpend,
    daysSinceLastOrder: c.lastOrderAt ? Math.floor((Date.now() - c.lastOrderAt.getTime()) / 86_400_000) : undefined,
    segments: c.segments,
  };
}

/** Uses so far, for coupons with a total or per-shopper limit. */
export async function usageOf(prisma: PrismaClient, storeId: string, coupons: Coupon[], customerId: string | null): Promise<Record<string, UsageCounts>> {
  const limited = coupons.filter((c) => c.limits.totalUses !== undefined || c.limits.perShopper !== undefined).map((c) => c.id);
  if (limited.length === 0) return {};
  const [total, mine] = await Promise.all([
    prisma.couponRedemption.groupBy({ by: ['couponId'], where: { storeId, couponId: { in: limited } }, _count: true }),
    customerId
      ? prisma.couponRedemption.groupBy({ by: ['couponId'], where: { storeId, couponId: { in: limited }, customerId }, _count: true })
      : Promise.resolve([] as Array<{ couponId: string; _count: number }>),
  ]);
  const out: Record<string, UsageCounts> = {};
  for (const id of limited) {
    out[id] = { total: total.find((t) => t.couponId === id)?._count ?? 0, byShopper: mine.find((t) => t.couponId === id)?._count ?? 0 };
  }
  return out;
}

export interface CartRequestLine {
  variantId: string;
  quantity: number;
  lineId?: string;
}

/** Re-reads every line's price from the catalog (the browser's prices are never used). Unknown / sold-out variants are dropped. */
export async function buildCart(catalog: Catalog, storeId: string, lines: CartRequestLine[], fresh = false): Promise<{ cart: Cart; dropped: string[] }> {
  const variants = await catalog.variants(storeId, lines.map((l) => l.variantId), fresh);
  const dropped: string[] = [];
  const cart: Cart = { currency: 'INR', lines: [] };
  lines.forEach((l, i) => {
    const v = variants.get(l.variantId);
    if (!v || !v.available) {
      dropped.push(l.variantId);
      return;
    }
    cart.lines.push({
      lineId: l.lineId ?? `l${i + 1}`,
      productId: v.productId,
      variantId: v.variantId,
      collectionIds: v.collectionIds,
      title: v.productTitle,
      variantTitle: v.title && v.title !== 'Default Title' ? v.title : undefined,
      image: v.image,
      quantity: l.quantity,
      unitPrice: v.price,
      compareAtPrice: v.compareAtPrice,
      weightGrams: v.weightGrams,
      sku: v.sku,
    });
  });
  return { cart, dropped };
}
