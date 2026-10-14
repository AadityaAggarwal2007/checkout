import { allocate, percentOf, type Paise } from '../money.js';
import type { CartLine } from '../types.js';
import { inScope } from './match.js';
import type {
  AmountOffCoupon,
  BundleCoupon,
  BuyXGetYCoupon,
  Coupon,
  DiscountValue,
  FreeGiftCoupon,
} from './types.js';

/**
 * Discounts are worked out per UNIT (one piece of a line), so "buy 1 get 1" and bundles can
 * pick exact pieces. A unit taken by one item-level deal is not taken by another
 * ("claimed"); order-level discounts are then spread over what is left.
 */
export interface Unit {
  lineIndex: number;
  price: Paise;
  discount: Paise;
  claimedBy?: string;
  /** Units discounted together show as one group in the cart ("B1G1 applied!"). */
  groupId?: string;
}

export function expandUnits(lines: CartLine[]): Unit[] {
  const units: Unit[] = [];
  lines.forEach((line, lineIndex) => {
    for (let i = 0; i < line.quantity; i++) units.push({ lineIndex, price: line.unitPrice, discount: 0 });
  });
  return units;
}

const remaining = (u: Unit) => u.price - u.discount;

function eligibleUnits(units: Unit[], lines: CartLine[], scope: Parameters<typeof inScope>[1]): Unit[] {
  return units.filter((u) => !u.claimedBy && inScope(lines[u.lineIndex]!, scope));
}

/** Buy X get Y: the cheapest eligible "get" pieces are discounted, paired with the dearest "buy" pieces. */
export function applyBuyXGetY(coupon: BuyXGetYCoupon, units: Unit[], lines: CartLine[]): Paise {
  let total = 0;
  let repeats = 0;
  const max = coupon.maxRepeats ?? Number.POSITIVE_INFINITY;
  const { quantity: buyQty } = coupon.buy;
  const { quantity: getQty } = coupon.get;
  if (buyQty < 1 || getQty < 1) return 0;
  while (repeats < max) {
    const getPool = eligibleUnits(units, lines, coupon.get.scope).sort((a, b) => a.price - b.price);
    const gets = getPool.slice(0, getQty);
    if (gets.length < getQty) break;
    const buyPool = eligibleUnits(units, lines, coupon.buy.scope)
      .filter((u) => !gets.includes(u))
      .sort((a, b) => b.price - a.price);
    const buys = buyPool.slice(0, buyQty);
    if (buys.length < buyQty) break;
    const groupId = `${coupon.id}#${repeats + 1}`;
    for (const u of buys) Object.assign(u, { claimedBy: coupon.id, groupId });
    for (const u of gets) {
      const off = percentOf(remaining(u), coupon.get.percentOff);
      u.discount += off;
      total += off;
      Object.assign(u, { claimedBy: coupon.id, groupId });
    }
    repeats += 1;
  }
  return total;
}

/** Bundles: every `bundleSize` pieces (dearest first) form one bundle with its price / discount. */
export function applyBundle(coupon: BundleCoupon, units: Unit[], lines: CartLine[]): Paise {
  if (coupon.bundleSize < 1) return 0;
  const pool = eligibleUnits(units, lines, coupon.scope).sort((a, b) => b.price - a.price);
  const groups: Unit[][] = [];
  if (coupon.sameProductOnly) {
    const byProduct = new Map<string, Unit[]>();
    for (const u of pool) {
      const key = lines[u.lineIndex]!.productId;
      byProduct.set(key, [...(byProduct.get(key) ?? []), u]);
    }
    for (const list of byProduct.values()) chunk(list, coupon.bundleSize, groups);
  } else {
    chunk(pool, coupon.bundleSize, groups);
  }
  const max = coupon.maxRepeats ?? Number.POSITIVE_INFINITY;
  let total = 0;
  groups.slice(0, Math.min(groups.length, max)).forEach((group, i) => {
    const value = group.reduce((s, u) => s + remaining(u), 0);
    let off: Paise;
    if (coupon.value.type === 'bundle_price') off = Math.max(0, value - coupon.value.price);
    else off = valueOff(coupon.value, value);
    const parts = allocate(off, group.map(remaining));
    group.forEach((u, j) => {
      u.discount += parts[j] ?? 0;
      u.claimedBy = coupon.id;
      u.groupId = `${coupon.id}#${i + 1}`;
    });
    total += off;
  });
  return total;
}

function chunk(list: Unit[], size: number, out: Unit[][]): void {
  for (let i = 0; i + size <= list.length; i += size) out.push(list.slice(i, i + size));
}

/** Amount off on some products (not the whole order). */
export function applyScopedAmountOff(coupon: AmountOffCoupon, units: Unit[], lines: CartLine[]): Paise {
  if (coupon.target === 'order') return 0;
  const pool = eligibleUnits(units, lines, coupon.target.scope);
  const value = pool.reduce((s, u) => s + remaining(u), 0);
  const off = valueOff(coupon.value, value);
  const parts = allocate(off, pool.map(remaining));
  pool.forEach((u, j) => {
    u.discount += parts[j] ?? 0;
    u.claimedBy = coupon.id;
  });
  return off;
}

/** Order-level: spread over every unit by what is left of its price. */
export function applyOrderLevel(couponId: string, value: DiscountValue, units: Unit[]): Paise {
  const base = units.reduce((s, u) => s + remaining(u), 0);
  const off = valueOff(value, base);
  const parts = allocate(off, units.map(remaining));
  units.forEach((u, j) => {
    u.discount += parts[j] ?? 0;
  });
  void couponId;
  return off;
}

export function valueOff(value: DiscountValue, base: Paise): Paise {
  if (base <= 0) return 0;
  if (value.type === 'fixed') return Math.min(value.amount, base);
  const off = percentOf(base, value.percent);
  return Math.min(value.maxDiscount !== undefined ? Math.min(off, value.maxDiscount) : off, base);
}

export interface GiftLine {
  couponId: string;
  variantId: string;
  productId: string;
  title: string;
  image?: string;
  quantity: number;
  /** Value of the gift (what it would cost), shown struck through. */
  unitPrice: Paise;
}

export function giftLines(coupon: FreeGiftCoupon): GiftLine[] {
  return coupon.gifts.map((g) => ({ couponId: coupon.id, ...g }));
}

export function isItemLevel(c: Coupon): boolean {
  return c.kind === 'buy_x_get_y' || c.kind === 'bundle' || (c.kind === 'amount_off' && c.target !== 'order');
}
