import { formatINR, type Coupon, type DiscountValue } from '@checkout/core';

/**
 * Words for a coupon, made from its rules: the headline on the shopper's coupon card, the
 * "Suggested details" bullets in the dashboard and the summary card next to the wizard.
 * No zod here: the checkout page and the drawer can import it.
 */

const METHOD_NAMES: Record<string, string> = {
  upi: 'UPI',
  card: 'cards',
  netbanking: 'net banking',
  wallet: 'wallets',
  emi: 'EMI',
  pay_later: 'pay later',
};

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, '')}%`;

export function valueText(v: DiscountValue): string {
  if (v.type === 'fixed') return `${formatINR(v.amount)} off`;
  return `${pct(v.percent)} off${v.maxDiscount ? ` (up to ${formatINR(v.maxDiscount)})` : ''}`;
}

const scoped = (scope: { productIds?: string[]; collectionIds?: string[] } | undefined) =>
  scope?.productIds?.length ? 'on selected products' : scope?.collectionIds?.length ? 'on selected collections' : 'on any items';

/** One line, e.g. "Flat 10% off on total value", "Buy 1 Get 1 FREE", "Extra 5% off on UPI". */
export function couponHeadline(c: Coupon): string {
  switch (c.kind) {
    case 'amount_off':
      return `Flat ${valueText(c.value)} ${c.target === 'order' ? 'on total value' : scoped(c.target.scope)}`;
    case 'buy_x_get_y':
      return c.get.percentOff >= 100 ? `Buy ${c.buy.quantity} Get ${c.get.quantity} FREE` : `Buy ${c.buy.quantity}, get ${c.get.quantity} at ${pct(c.get.percentOff)} off`;
    case 'free_gift': {
      const first = c.gifts[0];
      const what = c.gifts.length === 1 && first ? first.title : 'a free gift';
      return c.condition.minSubtotal ? `Free ${what} on orders above ${formatINR(c.condition.minSubtotal)}` : `Free ${what} with your order`;
    }
    case 'free_shipping':
      return 'Free shipping';
    case 'bundle':
      return c.value.type === 'bundle_price' ? `Any ${c.bundleSize} for ${formatINR(c.value.price)}` : `Buy ${c.bundleSize}, get ${valueText(c.value)}`;
    case 'purchase_driven':
      return `${valueText(c.value)} for our returning customers`;
    case 'payment_offer': {
      if (c.methods === 'online') return c.value ? `Extra ${valueText(c.value)} on online payments` : 'Offer on online payments';
      const parts = Object.entries(c.methods)
        .filter((e): e is [string, DiscountValue] => !!e[1])
        .map(([m, v]) => `${valueText(v)} on ${METHOD_NAMES[m] ?? m}`);
      return parts.length ? `Extra ${parts.join(', ')}` : 'Payment offer';
    }
  }
}

/** Bullets: when it works, who can use it, limits. */
export function couponDetails(c: Coupon): string[] {
  const out: string[] = [];
  const cond = c.condition;
  const where = cond.scope?.productIds?.length || cond.scope?.collectionIds?.length ? ' of selected items' : '';
  if (cond.minSubtotal) out.push(`Valid on a minimum purchase of ${formatINR(cond.minSubtotal)}${where}`);
  if (cond.maxSubtotal) out.push(`Valid on orders up to ${formatINR(cond.maxSubtotal)}`);
  if (cond.minQuantity) out.push(`Valid on a minimum of ${cond.minQuantity} item${cond.minQuantity === 1 ? '' : 's'}${where}`);
  if (cond.maxQuantity) out.push(`Valid on up to ${cond.maxQuantity} items`);
  if (c.kind === 'free_shipping' && c.maxShippingCharge !== undefined) out.push(`Covers shipping charges up to ${formatINR(c.maxShippingCharge)}`);
  if (c.kind === 'bundle' && c.sameProductOnly) out.push('All items of a bundle must be the same product');
  if (c.kind === 'purchase_driven') {
    const b = c.behaviour;
    if (b.minOrders) out.push(`For customers with ${b.minOrders}+ past order${b.minOrders === 1 ? '' : 's'}`);
    if (b.minLifetimeSpend) out.push(`For customers who spent ${formatINR(b.minLifetimeSpend)}+ with us`);
    if (b.lastOrderWithinDays) out.push(`Last order within ${b.lastOrderWithinDays} days`);
    if (b.lastOrderBeforeDays) out.push(`No order in the last ${b.lastOrderBeforeDays} days`);
  }
  const e = c.eligibility;
  if (e.orders === 'first') out.push('Valid on your first order only');
  else if (typeof e.orders === 'object') {
    if (e.orders.min !== undefined && e.orders.max !== undefined) out.push(`For customers with ${e.orders.min}-${e.orders.max} past orders`);
    else if (e.orders.min !== undefined) out.push(`For customers with ${e.orders.min}+ past orders`);
    else if (e.orders.max !== undefined) out.push(`For customers with up to ${e.orders.max} past orders`);
  }
  if (e.phones?.length || e.segments?.length) out.push('For selected customers only');
  const l = c.limits;
  if (l.perShopper === 1) out.push('Once per customer');
  else if (l.perShopper) out.push(`Up to ${l.perShopper} times per customer`);
  if (l.disableCod && c.kind !== 'payment_offer') out.push('Valid on prepaid orders only');
  else if (l.disablePartialCod) out.push('Not valid with partial COD');
  if (l.endsAt) out.push(`Valid till ${new Date(l.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`);
  if (!l.combinable) out.push('Cannot be combined with other offers');
  return out;
}

/** The merchant's summary card: everything the rules say, including what shoppers never see. */
export function couponSummary(c: Coupon): { headline: string; lines: string[]; limits: string[] } {
  const limits: string[] = [];
  const l = c.limits;
  limits.push(l.totalUses ? `${l.totalUses} uses in total` : 'No usage limit');
  if (l.disableCod) limits.push('COD disabled');
  if (l.disablePartialCod) limits.push('Partial COD disabled');
  limits.push(l.combinable ? 'Combines with other offers' : 'Does not combine');
  limits.push(l.startsAt ? `Valid from ${new Date(l.startsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}` : 'Valid now');
  return { headline: couponHeadline(c), lines: couponDetails(c), limits };
}
