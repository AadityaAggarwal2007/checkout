import type { Cart, CartLine, Coupon, ShippingConfig } from '../src/index.js';

let n = 0;
export function line(p: Partial<CartLine> & { unitPrice: number; quantity?: number }): CartLine {
  n += 1;
  return {
    lineId: p.lineId ?? `l${n}`,
    productId: p.productId ?? `p${n}`,
    variantId: p.variantId ?? `v${n}`,
    collectionIds: p.collectionIds ?? [],
    title: p.title ?? `Item ${n}`,
    quantity: p.quantity ?? 1,
    unitPrice: p.unitPrice,
    compareAtPrice: p.compareAtPrice,
    weightGrams: p.weightGrams,
  };
}

export function cart(...lines: CartLine[]): Cart {
  return { currency: 'INR', lines };
}

const base = {
  active: true,
  automatic: false,
  condition: {},
  eligibility: {},
  limits: { combinable: true },
};

export function coupon<T extends Coupon>(c: Partial<T> & Pick<T, 'id' | 'kind'>): T {
  return { ...base, ...c, limits: { ...base.limits, ...(c.limits ?? {}) } } as T;
}

/** Kurtiya-like shipping: ₹30 under ₹199, free from ₹199, COD everywhere. */
export const kurtiyaShipping: ShippingConfig = {
  zones: [
    {
      id: 'z-in',
      name: 'India',
      rates: [
        {
          id: 'r-std',
          name: 'Standard',
          eta: '6-7 days',
          basis: 'price',
          active: true,
          slabs: [
            { min: 0, max: 19900, charge: 3000, codAllowed: true },
            { min: 19900, charge: 0, codAllowed: true },
          ],
        },
      ],
    },
  ],
};
