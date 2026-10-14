import type { Paise } from '../money.js';
import type { PaymentMethod } from '../types.js';

/**
 * Coupon definitions as the merchant builds them in the dashboard wizard
 * (Setup -> Condition -> Eligibility -> Limits -> Preview). Stored as JSON in the
 * `Coupon` table and validated by zod in packages/shared.
 */
export type CouponKind =
  | 'amount_off'
  | 'buy_x_get_y'
  | 'free_gift'
  | 'free_shipping'
  | 'bundle'
  | 'purchase_driven'
  | 'payment_offer';

/** Which items a rule looks at. Empty lists = no restriction of that kind. */
export interface ItemScope {
  productIds?: string[];
  collectionIds?: string[];
  /** Variants that never count (e.g. gift products). */
  excludeVariantIds?: string[];
}

export interface CouponCondition {
  minSubtotal?: Paise;
  maxSubtotal?: Paise;
  minQuantity?: number;
  maxQuantity?: number;
  /** The subtotal / quantity above is measured on these items only (default: whole cart). */
  scope?: ItemScope;
}

export interface CouponEligibility {
  /** all shoppers, or only these verified phones */
  phones?: string[];
  segments?: string[];
  /** 'first' = only a shopper with 0 previous orders (needs a verified phone). */
  orders?: 'all' | 'first' | { min?: number; max?: number };
}

export interface CouponLimits {
  /** Max uses in total (all shoppers). Checked by the server against redemptions. */
  totalUses?: number;
  perShopper?: number;
  combinable: boolean;
  startsAt?: string;
  endsAt?: string;
  disableCod?: boolean;
  disablePartialCod?: boolean;
}

export type DiscountValue =
  | { type: 'percent'; percent: number; maxDiscount?: Paise }
  | { type: 'fixed'; amount: Paise };

interface CouponBase {
  id: string;
  kind: CouponKind;
  /** Upper-case code the shopper types. Absent for automatic-only coupons. */
  code?: string;
  automatic: boolean;
  /** Title shown on the coupon card ("Flat 5% OFF"). */
  title?: string;
  active: boolean;
  condition: CouponCondition;
  eligibility: CouponEligibility;
  limits: CouponLimits;
  /** Higher runs first when several apply; ties -> bigger saving first. */
  priority?: number;
}

export interface AmountOffCoupon extends CouponBase {
  kind: 'amount_off';
  /** 'order' = whole order after product discounts; scope = only those items. */
  target: 'order' | { scope: ItemScope };
  value: DiscountValue;
}

export interface BuyXGetYCoupon extends CouponBase {
  kind: 'buy_x_get_y';
  buy: { quantity: number; scope: ItemScope };
  get: { quantity: number; scope: ItemScope; percentOff: number };
  /** How many times the deal repeats in one order (default: unlimited). */
  maxRepeats?: number;
}

export interface FreeGiftCoupon extends CouponBase {
  kind: 'free_gift';
  gifts: Array<{ variantId: string; productId: string; title: string; image?: string; unitPrice: Paise; quantity: number }>;
}

export interface FreeShippingCoupon extends CouponBase {
  kind: 'free_shipping';
  /** Do not cover a shipping charge above this (FlexyPe "exclude rates over amount"). */
  maxShippingCharge?: Paise;
}

export interface BundleCoupon extends CouponBase {
  kind: 'bundle';
  scope: ItemScope;
  /** Units that make one bundle. */
  bundleSize: number;
  /** Only units of the same product make a bundle ("single product pack"). */
  sameProductOnly?: boolean;
  value: { type: 'bundle_price'; price: Paise } | DiscountValue;
  maxRepeats?: number;
}

export interface PurchaseDrivenCoupon extends CouponBase {
  kind: 'purchase_driven';
  /** Shopper history needed (needs a verified phone). */
  behaviour: { minOrders?: number; minLifetimeSpend?: Paise; lastOrderWithinDays?: number; lastOrderBeforeDays?: number };
  value: DiscountValue;
}

export interface PaymentOfferCoupon extends CouponBase {
  kind: 'payment_offer';
  /** 'online' = every online method; or a value per method. */
  methods: 'online' | Partial<Record<PaymentMethod, DiscountValue>>;
  value?: DiscountValue;
}

export type Coupon =
  | AmountOffCoupon
  | BuyXGetYCoupon
  | FreeGiftCoupon
  | FreeShippingCoupon
  | BundleCoupon
  | PurchaseDrivenCoupon
  | PaymentOfferCoupon;
