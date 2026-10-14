import type { Paise } from '../money.js';
import type { CartLine, PaymentMethod, ShopperContext } from '../types.js';
import { isCashMethod } from '../types.js';
import type { Coupon, CouponCondition, CouponEligibility, ItemScope } from './types.js';

/** Does this cart line belong to the scope? An empty scope matches everything. */
export function inScope(line: Pick<CartLine, 'productId' | 'variantId' | 'collectionIds'>, scope?: ItemScope): boolean {
  if (!scope) return true;
  if (scope.excludeVariantIds?.includes(line.variantId)) return false;
  const byProduct = scope.productIds && scope.productIds.length > 0;
  const byCollection = scope.collectionIds && scope.collectionIds.length > 0;
  if (!byProduct && !byCollection) return true;
  if (byProduct && scope.productIds!.includes(line.productId)) return true;
  if (byCollection && line.collectionIds.some((c) => scope.collectionIds!.includes(c))) return true;
  return false;
}

export function scopeTotals(lines: CartLine[], scope?: ItemScope): { subtotal: Paise; quantity: number } {
  let subtotal = 0;
  let quantity = 0;
  for (const line of lines) {
    if (!inScope(line, scope)) continue;
    subtotal += line.unitPrice * line.quantity;
    quantity += line.quantity;
  }
  return { subtotal, quantity };
}

export type RejectReason =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'used_up'
  | 'used_by_you'
  | 'min_subtotal'
  | 'max_subtotal'
  | 'min_quantity'
  | 'max_quantity'
  | 'login_needed'
  | 'not_eligible'
  | 'first_order_only'
  | 'cod_not_allowed'
  | 'payment_method'
  | 'no_items';

export interface UsageCounts {
  total: number;
  byShopper: number;
}

/** Short, shopper-facing text for each reason (English; the checkout can translate). */
export function rejectText(reason: RejectReason, coupon?: Coupon): string {
  const c = coupon?.condition;
  switch (reason) {
    case 'inactive':
    case 'not_started':
    case 'expired':
      return 'This code is not active right now.';
    case 'used_up':
      return 'This offer has been fully claimed.';
    case 'used_by_you':
      return 'You have already used this code.';
    case 'min_subtotal':
      return c?.minSubtotal ? `Add items worth ₹${Math.ceil(c.minSubtotal / 100)} or more to use this code.` : 'Add more items to use this code.';
    case 'max_subtotal':
      return 'This code works only on smaller orders.';
    case 'min_quantity':
      return c?.minQuantity ? `Add at least ${c.minQuantity} items to use this code.` : 'Add more items to use this code.';
    case 'max_quantity':
      return 'This code works only on fewer items.';
    case 'login_needed':
      return 'Verify your phone number to use this code.';
    case 'not_eligible':
      return 'This code is not available for your account.';
    case 'first_order_only':
      return 'This code is only for your first order.';
    case 'cod_not_allowed':
      return 'This offer is only for prepaid orders.';
    case 'payment_method':
      return 'This offer is for another payment method.';
    case 'no_items':
      return 'Your cart has no items this code applies to.';
  }
}

export function checkSchedule(coupon: Coupon, now: Date): RejectReason | null {
  if (!coupon.active) return 'inactive';
  if (coupon.limits.startsAt && now < new Date(coupon.limits.startsAt)) return 'not_started';
  if (coupon.limits.endsAt && now > new Date(coupon.limits.endsAt)) return 'expired';
  return null;
}

export function checkUsage(coupon: Coupon, usage: UsageCounts | undefined): RejectReason | null {
  if (!usage) return null;
  if (coupon.limits.totalUses !== undefined && usage.total >= coupon.limits.totalUses) return 'used_up';
  if (coupon.limits.perShopper !== undefined && usage.byShopper >= coupon.limits.perShopper) return 'used_by_you';
  return null;
}

export function checkCondition(condition: CouponCondition, lines: CartLine[]): RejectReason | null {
  const { subtotal, quantity } = scopeTotals(lines, condition.scope);
  if (quantity === 0 && condition.scope) return 'no_items';
  if (condition.minSubtotal !== undefined && subtotal < condition.minSubtotal) return 'min_subtotal';
  if (condition.maxSubtotal !== undefined && subtotal > condition.maxSubtotal) return 'max_subtotal';
  if (condition.minQuantity !== undefined && quantity < condition.minQuantity) return 'min_quantity';
  if (condition.maxQuantity !== undefined && quantity > condition.maxQuantity) return 'max_quantity';
  return null;
}

export function checkEligibility(rule: CouponEligibility, shopper: ShopperContext): RejectReason | null {
  const needsIdentity =
    (rule.phones && rule.phones.length > 0) ||
    (rule.segments && rule.segments.length > 0) ||
    (rule.orders !== undefined && rule.orders !== 'all');
  if (!needsIdentity) return null;
  if (!shopper.phone) return 'login_needed';
  if (rule.phones && rule.phones.length > 0 && !rule.phones.includes(shopper.phone)) return 'not_eligible';
  if (rule.segments && rule.segments.length > 0 && !rule.segments.some((s) => shopper.segments?.includes(s))) {
    return 'not_eligible';
  }
  const orders = shopper.orderCount ?? 0;
  if (rule.orders === 'first' && orders > 0) return 'first_order_only';
  if (rule.orders && typeof rule.orders === 'object') {
    if (rule.orders.min !== undefined && orders < rule.orders.min) return 'not_eligible';
    if (rule.orders.max !== undefined && orders > rule.orders.max) return 'not_eligible';
  }
  return null;
}

/** Cash methods are refused when the coupon disables them; payment offers need their method. */
export function checkPaymentMethod(coupon: Coupon, method: PaymentMethod | undefined): RejectReason | null {
  if (method === 'cod' && coupon.limits.disableCod) return 'cod_not_allowed';
  if (method === 'partial_cod' && (coupon.limits.disablePartialCod || coupon.limits.disableCod)) return 'cod_not_allowed';
  if (coupon.kind === 'payment_offer') {
    if (!method) return 'payment_method';
    if (coupon.methods === 'online') return isCashMethod(method) ? 'payment_method' : null;
    return coupon.methods[method] ? null : 'payment_method';
  }
  return null;
}
