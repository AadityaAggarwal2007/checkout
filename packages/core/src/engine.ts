import { decideRto, partialCodSplit, type CodSettings, type RtoDecision, type RtoSettings } from './cod.js';
import {
  applyBundle,
  applyBuyXGetY,
  applyOrderLevel,
  applyScopedAmountOff,
  expandUnits,
  giftLines,
  isItemLevel,
  type GiftLine,
  type Unit,
} from './coupons/apply.js';
import {
  checkCondition,
  checkEligibility,
  checkPaymentMethod,
  checkSchedule,
  checkUsage,
  rejectText,
  type RejectReason,
  type UsageCounts,
} from './coupons/match.js';
import type { Coupon, DiscountValue, PurchaseDrivenCoupon } from './coupons/types.js';
import type { Paise } from './money.js';
import { quoteShipping, type ShippingConfig, type ShippingOption } from './shipping.js';
import type { AddressContext, Cart, PaymentMethod, ShopperContext } from './types.js';
import { isCashMethod } from './types.js';

export interface PricingInput {
  cart: Cart;
  /** Every active coupon / payment offer of the store. */
  coupons: Coupon[];
  /** Codes the shopper typed (any case). */
  enteredCodes?: string[];
  /** Automatic coupons the shopper removed (when the store allows removing them). */
  removedAutomaticIds?: string[];
  shopper?: ShopperContext;
  address?: AddressContext;
  /** Undefined in the cart drawer (no method chosen yet). */
  paymentMethod?: PaymentMethod;
  shipping?: ShippingConfig;
  /** Chosen rate; default = cheapest available. */
  shippingRateId?: string;
  cod?: CodSettings;
  rto?: RtoSettings;
  usage?: Record<string, UsageCounts>;
  now?: Date;
}

export interface PricedLine {
  lineId: string;
  variantId: string;
  quantity: number;
  unitPrice: Paise;
  /** quantity × unitPrice */
  subtotal: Paise;
  discount: Paise;
  total: Paise;
  /** Display groups of this line's pieces ("B1G1 applied!"). */
  groupIds: string[];
  /** Pieces of this line that are free. */
  freeUnits: number;
}

export interface AppliedDiscount {
  couponId: string;
  code?: string;
  title?: string;
  kind: Coupon['kind'];
  automatic: boolean;
  amount: Paise;
  /** Only valid when paying online (coupon disables COD). */
  prepaidOnly: boolean;
}

export interface RejectedCode {
  code: string;
  reason: RejectReason | 'unknown_code' | 'not_combinable';
  message: string;
}

export interface CodAvailability {
  cod: boolean;
  partialCod: boolean;
  /** Why not (for "Show COD availability reasons"). */
  reasons: string[];
  rto: RtoDecision;
}

export interface PricingResult {
  lines: PricedLine[];
  gifts: GiftLine[];
  /** Sum of line subtotals (selling price, before our discounts). */
  subtotal: Paise;
  /** Discounts from item-level + order-level coupons and payment offers. */
  discount: Paise;
  /** subtotal − discount */
  merchandiseTotal: Paise;
  shipping: ShippingOption | null;
  shippingOptions: ShippingOption[];
  /** Shipping before a free-shipping coupon removed it. */
  shippingBeforeDiscount: Paise;
  codFee: Paise;
  total: Paise;
  /** For partial COD: pay now / pay on delivery. */
  payNow: Paise;
  payOnDelivery: Paise;
  /** ONE savings number (design rule 8): compare-at savings + discounts + free shipping + gifts. */
  savings: { compareAt: Paise; discounts: Paise; shipping: Paise; gifts: Paise; total: Paise };
  applied: AppliedDiscount[];
  rejected: RejectedCode[];
  codAvailability: CodAvailability;
  /** True when no shippable rate exists for this address. */
  unserviceable: boolean;
}

interface Candidate {
  coupon: Coupon;
  entered: boolean;
}

const norm = (code: string) => code.trim().toUpperCase();

function behaviourOk(c: PurchaseDrivenCoupon, shopper: ShopperContext): RejectReason | null {
  if (!shopper.phone) return 'login_needed';
  const b = c.behaviour;
  if (b.minOrders !== undefined && (shopper.orderCount ?? 0) < b.minOrders) return 'not_eligible';
  if (b.minLifetimeSpend !== undefined && (shopper.lifetimeSpend ?? 0) < b.minLifetimeSpend) return 'not_eligible';
  const days = shopper.daysSinceLastOrder;
  if (b.lastOrderWithinDays !== undefined && (days === undefined || days > b.lastOrderWithinDays)) return 'not_eligible';
  if (b.lastOrderBeforeDays !== undefined && (days === undefined || days < b.lastOrderBeforeDays)) return 'not_eligible';
  return null;
}

function rejectionOf(c: Coupon, input: PricingInput, now: Date): RejectReason | null {
  const shopper = input.shopper ?? {};
  return (
    checkSchedule(c, now) ??
    checkUsage(c, input.usage?.[c.id]) ??
    checkEligibility(c.eligibility, shopper) ??
    (c.kind === 'purchase_driven' ? behaviourOk(c, shopper) : null) ??
    checkCondition(c.condition, input.cart.lines) ??
    checkPaymentMethod(c, input.paymentMethod)
  );
}

/** Item-level deals first, then order-level, by priority. */
function stageOrder(a: Coupon, b: Coupon): number {
  const stage = (c: Coupon) => (isItemLevel(c) ? 0 : c.kind === 'payment_offer' ? 2 : 1);
  return stage(a) - stage(b) || (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id);
}

function paymentOfferValue(c: Extract<Coupon, { kind: 'payment_offer' }>, method?: PaymentMethod): DiscountValue | null {
  if (!method) return null;
  if (c.methods === 'online') return c.value ?? null;
  return c.methods[method] ?? null;
}

interface Applied {
  units: Unit[];
  amounts: Map<string, Paise>;
  gifts: GiftLine[];
  freeShipping?: { maxShippingCharge?: Paise; couponId: string };
}

function run(set: Coupon[], input: PricingInput): Applied {
  const units = expandUnits(input.cart.lines);
  const amounts = new Map<string, Paise>();
  const gifts: GiftLine[] = [];
  let freeShipping: Applied['freeShipping'];
  for (const c of [...set].sort(stageOrder)) {
    let amount = 0;
    switch (c.kind) {
      case 'buy_x_get_y':
        amount = applyBuyXGetY(c, units, input.cart.lines);
        break;
      case 'bundle':
        amount = applyBundle(c, units, input.cart.lines);
        break;
      case 'amount_off':
        amount = c.target === 'order' ? applyOrderLevel(c.id, c.value, units) : applyScopedAmountOff(c, units, input.cart.lines);
        break;
      case 'purchase_driven':
        amount = applyOrderLevel(c.id, c.value, units);
        break;
      case 'payment_offer': {
        const value = paymentOfferValue(c, input.paymentMethod);
        amount = value ? applyOrderLevel(c.id, value, units) : 0;
        break;
      }
      case 'free_gift':
        gifts.push(...giftLines(c));
        amount = 0;
        break;
      case 'free_shipping':
        freeShipping = { couponId: c.id, maxShippingCharge: c.maxShippingCharge };
        break;
    }
    amounts.set(c.id, amount);
  }
  return { units, amounts, gifts, freeShipping };
}

function valueOf(applied: Applied): number {
  const discounts = [...applied.amounts.values()].reduce((a, b) => a + b, 0);
  const gifts = applied.gifts.reduce((s, g) => s + g.unitPrice * g.quantity, 0);
  // Free shipping counts a little so it wins ties; its real value is known only after shipping.
  return discounts + gifts + (applied.freeShipping ? 1 : 0);
}

/**
 * Choose which coupons apply:
 * - a typed code that applies is always kept; if it does not combine, it applies alone;
 * - otherwise automatic coupons: all combinable ones together, or one non-combinable one alone,
 *   whichever saves the shopper more.
 */
function choose(candidates: Candidate[], input: PricingInput): { set: Coupon[]; dropped: Coupon[] } {
  const entered = candidates.filter((c) => c.entered).map((c) => c.coupon);
  const auto = candidates.filter((c) => !c.entered).map((c) => c.coupon);
  const enteredSolo = entered.find((c) => !c.limits.combinable);
  if (enteredSolo) {
    return { set: [enteredSolo], dropped: entered.filter((c) => c !== enteredSolo) };
  }
  const autoCombinable = auto.filter((c) => c.limits.combinable);
  const options: Coupon[][] = [[...entered, ...autoCombinable]];
  if (entered.length === 0) for (const c of auto.filter((x) => !x.limits.combinable)) options.push([c]);
  let best = options[0]!;
  let bestValue = valueOf(run(best, input));
  for (const option of options.slice(1)) {
    const v = valueOf(run(option, input));
    if (v > bestValue) {
      best = option;
      bestValue = v;
    }
  }
  return { set: best, dropped: [] };
}

export function price(input: PricingInput): PricingResult {
  const now = input.now ?? new Date();
  const shopper = input.shopper ?? {};
  const entered = new Set((input.enteredCodes ?? []).map(norm).filter(Boolean));
  const removed = new Set(input.removedAutomaticIds ?? []);
  const rejected: RejectedCode[] = [];
  const candidates: Candidate[] = [];
  const known = new Set<string>();

  for (const c of input.coupons) {
    const code = c.code ? norm(c.code) : undefined;
    const isEntered = !!code && entered.has(code);
    if (code && isEntered) known.add(code);
    if (!isEntered && (!c.automatic || removed.has(c.id))) continue;
    const reason = rejectionOf(c, input, now);
    if (reason) {
      if (isEntered && code) rejected.push({ code, reason, message: rejectText(reason, c) });
      continue;
    }
    candidates.push({ coupon: c, entered: isEntered });
  }
  for (const code of entered) {
    if (!known.has(code)) rejected.push({ code, reason: 'unknown_code', message: 'This code is not valid.' });
  }

  const { set, dropped } = choose(candidates, input);
  for (const c of dropped) {
    if (c.code) rejected.push({ code: norm(c.code), reason: 'not_combinable', message: 'This code cannot be used with your other code.' });
  }
  const applied = run(set, input);

  // Fold units back into lines.
  const lines: PricedLine[] = input.cart.lines.map((line, i) => {
    const units = applied.units.filter((u) => u.lineIndex === i);
    const discount = units.reduce((s, u) => s + u.discount, 0);
    const subtotal = line.unitPrice * line.quantity;
    return {
      lineId: line.lineId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal,
      discount,
      total: subtotal - discount,
      groupIds: [...new Set(units.map((u) => u.groupId).filter((g): g is string => !!g))],
      freeUnits: units.filter((u) => u.price > 0 && u.discount >= u.price).length,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const discount = lines.reduce((s, l) => s + l.discount, 0);
  const merchandiseTotal = subtotal - discount;
  // Shipping slabs use the value after coupons but before payment offers, so the
  // shipping charge does not change when the shopper switches payment method.
  const paymentOfferOff = set
    .filter((c) => c.kind === 'payment_offer')
    .reduce((s, c) => s + (applied.amounts.get(c.id) ?? 0), 0);
  const weightGrams = input.cart.lines.reduce((s, l) => s + (l.weightGrams ?? 0) * l.quantity, 0);
  const shippingOptions = input.shipping
    ? quoteShipping(input.shipping, { merchandiseTotal: merchandiseTotal + paymentOfferOff, weightGrams, address: input.address })
    : [];
  const unserviceable = !!input.shipping && shippingOptions.length === 0;
  let shipping = shippingOptions.find((o) => o.rateId === input.shippingRateId) ?? shippingOptions[0] ?? null;
  const shippingBeforeDiscount = shipping?.charge ?? 0;
  let shippingSaved = 0;
  if (shipping && applied.freeShipping && shipping.charge > 0) {
    const cap = applied.freeShipping.maxShippingCharge;
    if (cap === undefined || shipping.charge <= cap) {
      shippingSaved = shipping.charge;
      shipping = { ...shipping, charge: 0, label: 'Free shipping' };
    }
  }
  if (applied.freeShipping) applied.amounts.set(applied.freeShipping.couponId, shippingSaved);

  // COD availability (only meaningful once we know the totals).
  const preCodTotal = merchandiseTotal + (shipping?.charge ?? 0);
  const rto = decideRto(input.rto, { total: preCodTotal, lines: input.cart.lines, shopper, address: input.address });
  const reasons: string[] = [];
  const codOn = input.cod?.codEnabled ?? false;
  if (!codOn) reasons.push('Cash on delivery is not offered by this store.');
  if (shipping && !shipping.codAllowed) reasons.push('Cash on delivery is not available for this order value or location.');
  if (rto.blockCod) reasons.push('Cash on delivery is not available for this order.');
  const cod = codOn && !!shipping?.codAllowed && !rto.blockCod && !unserviceable;
  const partialCod =
    codOn && !!input.cod?.partial?.enabled && !!shipping?.codAllowed && !rto.blockPartialCod && !unserviceable;

  const codFee = input.paymentMethod === 'cod' ? input.cod?.codFee ?? 0 : 0;
  const total = merchandiseTotal + (shipping?.charge ?? 0) + codFee;
  let payNow = total;
  let payOnDelivery = 0;
  if (input.paymentMethod === 'cod') {
    payNow = 0;
    payOnDelivery = total;
  } else if (input.paymentMethod === 'partial_cod' && input.cod?.partial) {
    ({ payNow, payOnDelivery } = partialCodSplit(total, input.cod.partial));
  }

  const compareAt = input.cart.lines.reduce(
    (s, l) => s + Math.max(0, ((l.compareAtPrice ?? l.unitPrice) - l.unitPrice) * l.quantity),
    0,
  );
  const giftsValue = applied.gifts.reduce((s, g) => s + g.unitPrice * g.quantity, 0);

  return {
    lines,
    gifts: applied.gifts,
    subtotal,
    discount,
    merchandiseTotal,
    shipping,
    shippingOptions,
    shippingBeforeDiscount,
    codFee,
    total,
    payNow,
    payOnDelivery,
    savings: {
      compareAt,
      discounts: discount,
      shipping: shippingSaved,
      gifts: giftsValue,
      total: compareAt + discount + shippingSaved + giftsValue,
    },
    applied: [...set].sort(stageOrder).map((c) => ({
      couponId: c.id,
      code: c.code ? norm(c.code) : undefined,
      title: c.title,
      kind: c.kind,
      automatic: !candidates.find((x) => x.coupon === c)?.entered,
      amount: applied.amounts.get(c.id) ?? 0,
      prepaidOnly: !!c.limits.disableCod || c.kind === 'payment_offer',
    })),
    rejected,
    codAvailability: { cod, partialCod, reasons: cod ? [] : reasons, rto },
    unserviceable,
  };
}

/** Price the same cart for every method the store offers (checkout shows a price per method). */
export function priceByMethod(input: PricingInput, methods: PaymentMethod[]): Map<PaymentMethod, PricingResult> {
  const out = new Map<PaymentMethod, PricingResult>();
  for (const method of methods) {
    const result = price({ ...input, paymentMethod: method });
    if (method === 'cod' && !result.codAvailability.cod) continue;
    if (method === 'partial_cod' && !result.codAvailability.partialCod) continue;
    out.set(method, result);
  }
  return out;
}

export { isCashMethod };
