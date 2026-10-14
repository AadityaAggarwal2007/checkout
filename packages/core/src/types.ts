import type { Paise } from './money.js';

/** One line of the cart, with prices already re-read from Shopify on the server. */
export interface CartLine {
  /** Stable id of the line inside this cart (Shopify cart line key, or our own for gifts). */
  lineId: string;
  productId: string;
  variantId: string;
  collectionIds: string[];
  title: string;
  variantTitle?: string;
  image?: string;
  quantity: number;
  /** Selling price of ONE unit before any of our discounts. */
  unitPrice: Paise;
  /** Shopify "compare at" price of one unit, if any (only for the "you saved" display). */
  compareAtPrice?: Paise;
  weightGrams?: number;
  sku?: string;
}

export interface Cart {
  currency: 'INR';
  lines: CartLine[];
}

/** What we know about the shopper when pricing (all optional: a guest knows nothing). */
export interface ShopperContext {
  /** Verified phone (E.164, +91...) — only after OTP. */
  phone?: string;
  /** Orders this shopper placed before in this store (all payment methods). */
  orderCount?: number;
  codOrderCount?: number;
  returnedOrderCount?: number;
  /** Lifetime spend in this store, paise. */
  lifetimeSpend?: Paise;
  /** Days since the last order, if any. */
  daysSinceLastOrder?: number;
  /** Segment keys the merchant assigned (future). */
  segments?: string[];
}

export interface AddressContext {
  pincode?: string;
  /** State name as in our state list, e.g. "Maharashtra". */
  state?: string;
  country?: string;
}

/** Payment methods the checkout can show. 'cod' and 'partial_cod' are the cash ones. */
export const PAYMENT_METHODS = [
  'upi',
  'card',
  'netbanking',
  'wallet',
  'emi',
  'pay_later',
  'cod',
  'partial_cod',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ONLINE_METHODS: readonly PaymentMethod[] = PAYMENT_METHODS.filter(
  (m) => m !== 'cod' && m !== 'partial_cod',
);

export function isCashMethod(method: PaymentMethod | undefined): boolean {
  return method === 'cod' || method === 'partial_cod';
}
