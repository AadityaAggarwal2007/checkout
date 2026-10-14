import type { Coupon as CoreCoupon } from '@checkout/core';
import { normalizeIndianMobile } from './india.js';
import { z } from 'zod';

/**
 * What the dashboard's coupon wizard sends (POST / PUT /api/stores/:id/coupons). One schema per
 * kind; the server turns it into a packages/core Coupon. Amounts in paise, percents as numbers
 * (12.5 = 12.5%). Free-gift titles and prices are filled by the server from the catalog.
 */

const paise = z.number().int().min(0).max(100_000_000);
const id = z.string().regex(/^\d{1,20}$/);
const ids = (max: number) => z.array(id).max(max).default([]);

export const itemScopeSchema = z.object({
  productIds: ids(200),
  collectionIds: ids(50),
  excludeVariantIds: ids(200),
});

const hasItems = (s: z.infer<typeof itemScopeSchema>) => s.productIds.length + s.collectionIds.length > 0;

export const discountValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), percent: z.number().gt(0, 'Percent must be above 0').max(100), maxDiscount: paise.positive().optional() }),
  z.object({ type: z.literal('fixed'), amount: paise.positive('Enter the amount') }),
]);

export const conditionSchema = z
  .object({
    minSubtotal: paise.optional(),
    maxSubtotal: paise.optional(),
    minQuantity: z.number().int().min(1).max(999).optional(),
    maxQuantity: z.number().int().min(1).max(999).optional(),
    scope: itemScopeSchema.optional(),
  })
  .refine((c) => c.minSubtotal === undefined || c.maxSubtotal === undefined || c.maxSubtotal >= c.minSubtotal, 'Maximum purchase amount must be above the minimum')
  .refine((c) => c.minQuantity === undefined || c.maxQuantity === undefined || c.maxQuantity >= c.minQuantity, 'Maximum quantity must be above the minimum');

export const eligibilitySchema = z.object({
  phones: z
    .array(z.string())
    .max(5000)
    .optional()
    .transform((list, ctx) => {
      if (!list) return undefined;
      const out: string[] = [];
      for (const p of list) {
        const n = normalizeIndianMobile(p);
        if (!n) {
          ctx.addIssue({ code: 'custom', message: `"${p}" is not a valid mobile number` });
          return z.NEVER;
        }
        out.push(n);
      }
      return [...new Set(out)];
    }),
  segments: z.array(z.string().max(40)).max(20).optional(),
  orders: z.union([z.literal('all'), z.literal('first'), z.object({ min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() })]).default('all'),
});

export const limitsSchema = z
  .object({
    totalUses: z.number().int().min(1).optional(),
    perShopper: z.number().int().min(1).optional(),
    combinable: z.boolean().default(true),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    disableCod: z.boolean().default(false),
    disablePartialCod: z.boolean().default(false),
  })
  .refine((l) => !l.startsAt || !l.endsAt || new Date(l.endsAt) > new Date(l.startsAt), 'The end date must be after the start date');

const base = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, 'Codes use 2-30 letters, numbers, - or _')
    .optional(),
  automatic: z.boolean(),
  title: z.string().trim().max(60).optional(),
  details: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  /** Shown in the coupon list to shoppers. */
  visible: z.boolean().default(true),
  active: z.boolean().default(true),
  priority: z.number().int().min(-100).max(100).default(0),
  condition: conditionSchema.default({}),
  eligibility: eligibilitySchema.default({}),
  limits: limitsSchema.default({}),
};

export const couponInputSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...base,
      kind: z.literal('amount_off'),
      target: z.union([z.literal('order'), z.object({ scope: itemScopeSchema.refine(hasItems, 'Choose the products or collections') })]),
      value: discountValueSchema,
    }),
    z.object({
      ...base,
      kind: z.literal('buy_x_get_y'),
      buy: z.object({ quantity: z.number().int().min(1).max(50), scope: itemScopeSchema.default({}) }),
      get: z.object({ quantity: z.number().int().min(1).max(50), scope: itemScopeSchema.refine(hasItems, 'Choose what the customer gets'), percentOff: z.number().gt(0).max(100).default(100) }),
      maxRepeats: z.number().int().min(1).max(100).optional(),
    }),
    z.object({
      ...base,
      kind: z.literal('free_gift'),
      gifts: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(10).default(1) })).min(1, 'Choose the free product').max(5),
    }),
    z.object({ ...base, kind: z.literal('free_shipping'), maxShippingCharge: paise.optional() }),
    z.object({
      ...base,
      kind: z.literal('bundle'),
      scope: itemScopeSchema.refine(hasItems, 'Choose the products or collections of the bundle'),
      bundleSize: z.number().int().min(2, 'A bundle has at least 2 items').max(50),
      sameProductOnly: z.boolean().default(false),
      value: z.union([z.object({ type: z.literal('bundle_price'), price: paise.positive('Enter the bundle price') }), discountValueSchema]),
      maxRepeats: z.number().int().min(1).max(100).optional(),
    }),
    z.object({
      ...base,
      kind: z.literal('purchase_driven'),
      behaviour: z
        .object({
          minOrders: z.number().int().min(1).optional(),
          minLifetimeSpend: paise.positive().optional(),
          lastOrderWithinDays: z.number().int().min(1).max(3650).optional(),
          lastOrderBeforeDays: z.number().int().min(1).max(3650).optional(),
        })
        .refine((b) => Object.values(b).some((v) => v !== undefined), 'Set at least one past-order rule'),
      value: discountValueSchema,
    }),
    z.object({
      ...base,
      kind: z.literal('payment_offer'),
      methods: z.union([
        z.literal('online'),
        z
          .object({ upi: discountValueSchema, card: discountValueSchema, netbanking: discountValueSchema, wallet: discountValueSchema, emi: discountValueSchema, pay_later: discountValueSchema })
          .partial()
          .refine((m) => Object.keys(m).length > 0, 'Set a discount for at least one payment mode'),
      ]),
      value: discountValueSchema.optional(),
    }),
  ])
  .superRefine((c, ctx) => {
    if (!c.automatic && !c.code) ctx.addIssue({ code: 'custom', path: ['code'], message: 'Enter the code customers type' });
    if (c.kind === 'payment_offer' && c.methods === 'online' && !c.value) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the discount' });
    if (c.kind === 'bundle' && c.value.type === 'bundle_price' && c.value.price <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the bundle price' });
  });

export type CouponInput = z.input<typeof couponInputSchema>;
export type CouponData = z.output<typeof couponInputSchema>;

/** The six kinds the "Create coupon" chooser offers (payment offers have their own page). */
export const COUPON_KINDS = [
  { kind: 'amount_off', title: 'Amount off products / order', text: 'A percent or fixed amount off the order or some products.' },
  { kind: 'buy_x_get_y', title: 'Buy X get Y', text: 'Buy some items, get others free or at a discount (B1G1).' },
  { kind: 'purchase_driven', title: 'Purchase driven', text: 'A discount based on the customer’s past orders.' },
  { kind: 'free_gift', title: 'Exclusive free gift', text: 'A free product when the cart reaches an amount.' },
  { kind: 'free_shipping', title: 'Free shipping', text: 'Remove the shipping charge.' },
  { kind: 'bundle', title: 'Bundle discount', text: 'Save more when buying a set: any 3 for ₹999.' },
] as const;

export interface CouponListRow {
  id: string;
  kind: CouponData['kind'];
  code: string | null;
  title: string | null;
  headline: string;
  automatic: boolean;
  active: boolean;
  visible: boolean;
  combinable: boolean;
  createdAt: string;
  stats: { orders: number; gross: number; discount: number; net: number };
}

type Scope = z.infer<typeof itemScopeSchema>;

/** Empty lists mean "no restriction"; an empty scope object is dropped entirely. */
function cleanScope(s: Scope | undefined): CoreCoupon['condition']['scope'] {
  if (!s) return undefined;
  const out: NonNullable<CoreCoupon['condition']['scope']> = {};
  if (s.productIds.length) out.productIds = s.productIds;
  if (s.collectionIds.length) out.collectionIds = s.collectionIds;
  if (s.excludeVariantIds.length) out.excludeVariantIds = s.excludeVariantIds;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Wizard data -> the engine's coupon. Free-gift lines need their product id, title and price
 * from the catalog (`gifts`); the dashboard preview may pass placeholders.
 */
export function couponDataToCore(
  d: CouponData,
  id = '',
  gifts: Record<string, { productId: string; title: string; image?: string; unitPrice: number }> = {},
): CoreCoupon {
  const common = {
    id,
    code: d.code,
    automatic: d.automatic,
    title: d.title || undefined,
    active: d.active,
    priority: d.priority,
    condition: { ...d.condition, scope: cleanScope(d.condition.scope) },
    eligibility: { ...d.eligibility, phones: d.eligibility.phones?.length ? d.eligibility.phones : undefined },
    limits: d.limits,
  };
  switch (d.kind) {
    case 'amount_off':
      return { ...common, kind: d.kind, target: d.target === 'order' ? 'order' : { scope: cleanScope(d.target.scope) ?? {} }, value: d.value };
    case 'buy_x_get_y':
      return { ...common, kind: d.kind, buy: { quantity: d.buy.quantity, scope: cleanScope(d.buy.scope) ?? {} }, get: { ...d.get, scope: cleanScope(d.get.scope) ?? {} }, maxRepeats: d.maxRepeats };
    case 'free_gift':
      return {
        ...common,
        kind: d.kind,
        gifts: d.gifts.map((g) => ({ variantId: g.variantId, quantity: g.quantity, ...(gifts[g.variantId] ?? { productId: '', title: 'Free gift', unitPrice: 0 }) })),
      };
    case 'free_shipping':
      return { ...common, kind: d.kind, maxShippingCharge: d.maxShippingCharge };
    case 'bundle':
      return { ...common, kind: d.kind, scope: cleanScope(d.scope) ?? {}, bundleSize: d.bundleSize, sameProductOnly: d.sameProductOnly, value: d.value, maxRepeats: d.maxRepeats };
    case 'purchase_driven':
      return { ...common, kind: d.kind, behaviour: d.behaviour, value: d.value };
    case 'payment_offer':
      return { ...common, kind: d.kind, methods: d.methods, value: d.value };
  }
}
