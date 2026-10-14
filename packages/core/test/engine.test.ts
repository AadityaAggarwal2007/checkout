import { describe, expect, it } from 'vitest';
import {
  price,
  priceByMethod,
  type AmountOffCoupon,
  type BundleCoupon,
  type BuyXGetYCoupon,
  type FreeGiftCoupon,
  type FreeShippingCoupon,
  type PaymentOfferCoupon,
  type PurchaseDrivenCoupon,
} from '../src/index.js';
import { cart, coupon, kurtiyaShipping, line } from './fixtures.js';

const jhumka = (q = 1) => line({ productId: 'jhumka', variantId: 'jhumka-silver-3', unitPrice: 12400, compareAtPrice: 59900, quantity: q, collectionIds: ['jhumkas'] });

const b1g1 = coupon<BuyXGetYCoupon>({
  id: 'b1g1',
  kind: 'buy_x_get_y',
  code: 'B1G1',
  automatic: true,
  buy: { quantity: 1, scope: { collectionIds: ['jhumkas'] } },
  get: { quantity: 1, scope: { collectionIds: ['jhumkas'] }, percentOff: 100 },
});

const prepaid5 = coupon<AmountOffCoupon>({
  id: 'prepaid5',
  kind: 'amount_off',
  code: 'PREPAID',
  automatic: true,
  title: 'Extra 5% off on prepaid',
  target: 'order',
  value: { type: 'percent', percent: 5 },
  limits: { combinable: true, disableCod: true, disablePartialCod: true },
});

describe('buy 1 get 1 (kurtiya jhumkas)', () => {
  it('makes one of two pieces free and groups them', () => {
    const r = price({ cart: cart(jhumka(2)), coupons: [b1g1] });
    expect(r.subtotal).toBe(24800);
    expect(r.discount).toBe(12400);
    expect(r.lines[0]!.freeUnits).toBe(1);
    expect(r.lines[0]!.groupIds).toEqual(['b1g1#1']);
    expect(r.applied).toMatchObject([{ couponId: 'b1g1', amount: 12400, automatic: true }]);
  });

  it('pairs pieces one by one: 3 pieces = 1 free, 8 pieces = 4 free', () => {
    expect(price({ cart: cart(jhumka(3)), coupons: [b1g1] }).discount).toBe(12400);
    const eight = price({ cart: cart(jhumka(8)), coupons: [b1g1] });
    expect(eight.discount).toBe(4 * 12400);
    expect(eight.lines[0]!.groupIds).toHaveLength(4);
  });

  it('gives the cheaper piece free across different products', () => {
    const r = price({
      cart: cart(
        line({ productId: 'a', unitPrice: 30000, collectionIds: ['jhumkas'] }),
        line({ productId: 'b', unitPrice: 10000, collectionIds: ['jhumkas'] }),
      ),
      coupons: [b1g1],
    });
    expect(r.discount).toBe(10000);
    expect(r.lines[1]!.freeUnits).toBe(1);
  });

  it('ignores items outside the scope', () => {
    const r = price({ cart: cart(jhumka(1), line({ unitPrice: 50000 })), coupons: [b1g1] });
    expect(r.discount).toBe(0);
  });
});

describe('prepaid 5% that switches COD off (how kurtiya rewards prepaid)', () => {
  const input = { cart: cart(line({ unitPrice: 19000 })), coupons: [prepaid5], cod: { codEnabled: true, codFee: 0 }, shipping: kurtiyaShipping };

  it('gives 5% on UPI and full price on COD', () => {
    const byMethod = priceByMethod(input, ['upi', 'cod']);
    expect(byMethod.get('upi')!.total).toBe(18050 + 3000); // 190 - 9.50, + ₹30 shipping (under ₹199)
    expect(byMethod.get('cod')!.total).toBe(19000 + 3000);
    expect(byMethod.get('cod')!.applied).toEqual([]);
  });

  it('shows the saving in the cart (no method yet) and marks it prepaid-only', () => {
    const r = price(input);
    expect(r.applied[0]).toMatchObject({ couponId: 'prepaid5', prepaidOnly: true, amount: 950 });
  });

  it('shipping slab is chosen before the payment offer, so it does not jump between methods', () => {
    const offer = coupon<PaymentOfferCoupon>({ id: 'upi10', kind: 'payment_offer', automatic: true, methods: { upi: { type: 'percent', percent: 10 } } });
    const c = cart(line({ unitPrice: 20000 }));
    const upi = price({ cart: c, coupons: [offer], paymentMethod: 'upi', shipping: kurtiyaShipping });
    expect(upi.shipping?.charge).toBe(0); // ₹200 before the offer is in the free slab
    expect(upi.total).toBe(18000);
  });
});

describe('coupon codes', () => {
  const flat100 = coupon<AmountOffCoupon>({ id: 'flat100', kind: 'amount_off', code: 'flat100', target: 'order', value: { type: 'fixed', amount: 10000 }, condition: { minSubtotal: 49900 } });
  const solo = coupon<AmountOffCoupon>({ id: 'solo', kind: 'amount_off', code: 'SOLO20', target: 'order', value: { type: 'percent', percent: 20, maxDiscount: 15000 }, limits: { combinable: false } });

  it('accepts any case and applies with the automatic ones', () => {
    const r = price({ cart: cart(line({ unitPrice: 60000 })), coupons: [flat100, prepaid5], enteredCodes: [' Flat100 '] });
    // item-level none; order-level: prepaid5 and flat100 both order-level, applied by priority then id
    expect(r.applied.map((a) => a.couponId).sort()).toEqual(['flat100', 'prepaid5']);
    expect(r.discount).toBe(10000 + 2500); // flat100 then 5% of 500 (id order: flat100 < prepaid5)
  });

  it('explains why a code does not apply', () => {
    const r = price({ cart: cart(line({ unitPrice: 30000 })), coupons: [flat100], enteredCodes: ['FLAT100', 'NOPE'] });
    expect(r.rejected).toEqual([
      { code: 'FLAT100', reason: 'min_subtotal', message: 'Add items worth ₹499 or more to use this code.' },
      { code: 'NOPE', reason: 'unknown_code', message: 'This code is not valid.' },
    ]);
  });

  it('a non-combinable typed code applies alone and caps at its maximum', () => {
    const r = price({ cart: cart(line({ unitPrice: 100000 })), coupons: [solo, prepaid5], enteredCodes: ['solo20'] });
    expect(r.applied.map((a) => a.couponId)).toEqual(['solo']);
    expect(r.discount).toBe(15000);
  });

  it('picks the better of automatic options when one does not combine', () => {
    const autoSolo = { ...solo, id: 'auto-solo', code: undefined, automatic: true };
    const r = price({ cart: cart(line({ unitPrice: 100000 })), coupons: [autoSolo, prepaid5] });
    expect(r.applied.map((a) => a.couponId)).toEqual(['auto-solo']); // ₹150 beats 5% (₹50)
  });

  it('respects schedule, usage limits and first-order eligibility', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const later = { ...flat100, id: 'later', code: 'LATER', limits: { combinable: true, startsAt: '2026-11-01T00:00:00Z' } };
    const used = { ...flat100, id: 'used', code: 'USED', condition: {}, limits: { combinable: true, totalUses: 10 } };
    const first = { ...flat100, id: 'first', code: 'FIRST', condition: {}, eligibility: { orders: 'first' as const } };
    const r = price({
      cart: cart(line({ unitPrice: 60000 })),
      coupons: [later, used, first],
      enteredCodes: ['LATER', 'USED', 'FIRST'],
      usage: { used: { total: 10, byShopper: 0 } },
      shopper: { phone: '+919999999999', orderCount: 2 },
      now,
    });
    expect(r.rejected.map((x) => x.reason)).toEqual(['not_started', 'used_up', 'first_order_only']);
  });

  it('asks to log in for shopper-specific coupons', () => {
    const vip = coupon<AmountOffCoupon>({ id: 'vip', kind: 'amount_off', code: 'VIP', target: 'order', value: { type: 'percent', percent: 10 }, eligibility: { phones: ['+911111111111'] } });
    expect(price({ cart: cart(line({ unitPrice: 1000 })), coupons: [vip], enteredCodes: ['VIP'] }).rejected[0]!.reason).toBe('login_needed');
  });
});

describe('free gifts, free shipping, bundles, purchase driven', () => {
  const gift = (id: string, min: number): FreeGiftCoupon =>
    coupon<FreeGiftCoupon>({
      id,
      kind: 'free_gift',
      code: id.toUpperCase(),
      automatic: true,
      condition: { minSubtotal: min },
      gifts: [{ variantId: `${id}-v`, productId: `${id}-p`, title: id, unitPrice: 49900, quantity: 1 }],
    });

  it('adds every gift tier the cart has reached', () => {
    const r = price({ cart: cart(line({ unitPrice: 50000 })), coupons: [gift('freegift299', 29900), gift('freegift499', 49900), gift('freegift599', 59900)] });
    expect(r.gifts.map((g) => g.couponId).sort()).toEqual(['freegift299', 'freegift499']);
    expect(r.savings.gifts).toBe(2 * 49900);
    expect(r.total).toBe(50000); // gifts cost nothing
  });

  it('free shipping removes the charge, but not above its cap', () => {
    const fs = coupon<FreeShippingCoupon>({ id: 'fs', kind: 'free_shipping', automatic: true });
    const capped = { ...fs, id: 'fs-cap', maxShippingCharge: 2000 };
    const small = cart(line({ unitPrice: 10000 }));
    const r = price({ cart: small, coupons: [fs], shipping: kurtiyaShipping });
    expect(r.shipping).toMatchObject({ charge: 0, label: 'Free shipping' });
    expect(r.savings.shipping).toBe(3000);
    const r2 = price({ cart: small, coupons: [capped], shipping: kurtiyaShipping });
    expect(r2.shipping).toMatchObject({ charge: 3000, label: 'Shipping' });
  });

  it('bundle price: any 3 kurtis for ₹999', () => {
    const bundle = coupon<BundleCoupon>({ id: 'b3', kind: 'bundle', automatic: true, scope: { collectionIds: ['kurti'] }, bundleSize: 3, value: { type: 'bundle_price', price: 99900 } });
    const k = (p: number) => line({ unitPrice: p, collectionIds: ['kurti'] });
    const r = price({ cart: cart(k(49900), k(39900), k(29900), k(19900)), coupons: [bundle] });
    // dearest three (499+399+299 = 1197) become 999; the 199 piece stays full price
    expect(r.discount).toBe(119700 - 99900);
    expect(r.merchandiseTotal).toBe(99900 + 19900);
  });

  it('purchase driven: only for shoppers with enough past orders', () => {
    const loyal = coupon<PurchaseDrivenCoupon>({ id: 'loyal', kind: 'purchase_driven', automatic: true, behaviour: { minOrders: 3 }, value: { type: 'percent', percent: 10 } });
    const c = cart(line({ unitPrice: 100000 }));
    expect(price({ cart: c, coupons: [loyal], shopper: { phone: '+91x', orderCount: 1 } }).discount).toBe(0);
    expect(price({ cart: c, coupons: [loyal], shopper: { phone: '+91x', orderCount: 3 } }).discount).toBe(10000);
  });
});

describe('invariants', () => {
  it('totals always add up and never go negative', () => {
    const coupons = [
      b1g1,
      prepaid5,
      coupon<AmountOffCoupon>({ id: 'big', kind: 'amount_off', automatic: true, target: 'order', value: { type: 'fixed', amount: 9999999 } }),
    ];
    for (let seed = 1; seed < 150; seed++) {
      const lines = Array.from({ length: 1 + (seed % 4) }, (_, i) =>
        line({ unitPrice: ((seed * 7919 + i * 104729) % 300000) + 1, quantity: 1 + ((seed + i) % 3), collectionIds: i % 2 ? ['jhumkas'] : [] }),
      );
      const r = price({ cart: cart(...lines), coupons, shipping: kurtiyaShipping, cod: { codEnabled: true, codFee: 0 } });
      expect(r.lines.every((l) => l.total >= 0 && l.discount >= 0)).toBe(true);
      expect(r.subtotal - r.discount).toBe(r.merchandiseTotal);
      expect(r.total).toBe(r.merchandiseTotal + (r.shipping?.charge ?? 0) + r.codFee);
      expect(r.discount).toBe(r.applied.filter((a) => a.kind !== 'free_shipping').reduce((s, a) => s + a.amount, 0));
    }
  });
});
