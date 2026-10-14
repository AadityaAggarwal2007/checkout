import { z } from 'zod';

/** Upsell rules (dashboard > Upsell): WHEN the cart has … → SHOW these products in the checkout, x% off, with a timer. */
const ids = z.array(z.string().regex(/^\d{1,20}$/)).max(200);

export const upsellWhenSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('any') }),
  z.object({ kind: z.literal('products'), productIds: ids.min(1, 'Choose the products that trigger the offer') }),
  z.object({ kind: z.literal('collections'), collectionIds: ids.min(1, 'Choose the collections that trigger the offer') }),
]);

export const upsellRuleSchema = z.object({
  when: upsellWhenSchema,
  /** Products offered (the first available variant, or the shopper picks one). */
  productIds: ids.min(1, 'Choose at least one product to offer').max(10, 'Up to 10 products'),
  audience: z.enum(['all', 'new', 'repeat']).default('all'),
  /** Extra % off the offered products (0 = full price). */
  discountPercent: z.number().int().min(0).max(90).default(0),
  /** Minutes the offer lasts once shown (0 = no timer). */
  timerMinutes: z.number().int().min(0).max(120).default(0),
  title: z.string().trim().min(1).max(40).default('Add to your order'),
  maxItems: z.number().int().min(1).max(6).default(3),
});
export type UpsellRuleData = z.output<typeof upsellRuleSchema>;

export const upsellInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the rule').max(60),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  rule: upsellRuleSchema,
});
export type UpsellInput = z.output<typeof upsellInputSchema>;
export interface UpsellRuleView extends UpsellInput {
  id: string;
  text: string;
}

/** "Cart has Kurtis → 3 products, 10% off, 15 min timer" */
export function describeUpsell(r: UpsellRuleData): string {
  const when = r.when.kind === 'any' ? 'Any cart' : r.when.kind === 'products' ? `Cart has one of ${r.when.productIds.length} product${r.when.productIds.length === 1 ? '' : 's'}` : `Cart has items of ${r.when.collectionIds.length} collection${r.when.collectionIds.length === 1 ? '' : 's'}`;
  const parts = [`${r.productIds.length} product${r.productIds.length === 1 ? '' : 's'}`];
  if (r.discountPercent) parts.push(`${r.discountPercent}% off`);
  if (r.timerMinutes) parts.push(`${r.timerMinutes} min timer`);
  if (r.audience !== 'all') parts.push(r.audience === 'new' ? 'new customers' : 'repeat customers');
  return `${when} → ${parts.join(', ')}`;
}

/** The offer as the checkout shows it (CheckoutState.upsell). Prices from the server. */
export interface CheckoutUpsell {
  ruleId: string;
  title: string;
  percent: number;
  /** Epoch ms when the offer ends (timer), if it has one. */
  endsAt?: number;
  items: Array<{ productId: string; title: string; image?: string; variants: Array<{ variantId: string; title?: string; price: number; offerPrice: number }> }>;
}
