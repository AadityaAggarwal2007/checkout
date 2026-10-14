import type { Coupon } from '@checkout/core';
import { describe, expect, it } from 'vitest';
import { couponDetails, couponHeadline, couponSummary } from '../src/coupon-text.js';
import { couponInputSchema } from '../src/coupons.js';

const base = { automatic: true, condition: {}, eligibility: {}, limits: { combinable: true }, active: true, id: 'c1' } as const;

describe('coupon input', () => {
  it('needs a code unless automatic, and upper-cases it', () => {
    const noCode = couponInputSchema.safeParse({ kind: 'free_shipping', automatic: false });
    expect(noCode.success).toBe(false);
    if (!noCode.success) expect(noCode.error.issues[0]?.message).toMatch(/code/);
    const ok = couponInputSchema.parse({ kind: 'free_shipping', automatic: false, code: ' ship-free ' });
    expect(ok.code).toBe('SHIP-FREE');
    expect(ok.limits).toMatchObject({ combinable: true, disableCod: false });
  });

  it('checks each kind', () => {
    expect(couponInputSchema.safeParse({ kind: 'bundle', automatic: true, scope: {}, bundleSize: 3, value: { type: 'bundle_price', price: 99900 } }).success).toBe(false);
    expect(couponInputSchema.safeParse({ kind: 'bundle', automatic: true, scope: { collectionIds: ['9001'] }, bundleSize: 3, value: { type: 'bundle_price', price: 99900 } }).success).toBe(true);
    expect(couponInputSchema.safeParse({ kind: 'buy_x_get_y', automatic: true, buy: { quantity: 1 }, get: { quantity: 1, scope: {} } }).success).toBe(false);
    expect(couponInputSchema.safeParse({ kind: 'payment_offer', automatic: true, methods: 'online' }).success).toBe(false);
    expect(couponInputSchema.safeParse({ kind: 'payment_offer', automatic: true, methods: { upi: { type: 'percent', percent: 5 } } }).success).toBe(true);
    expect(couponInputSchema.safeParse({ kind: 'purchase_driven', automatic: true, behaviour: {}, value: { type: 'percent', percent: 5 } }).success).toBe(false);
    expect(couponInputSchema.safeParse({ kind: 'amount_off', automatic: true, target: 'order', value: { type: 'percent', percent: 0 } }).success).toBe(false);
  });

  it('normalises customer phones and refuses bad ones and wrong dates', () => {
    const ok = couponInputSchema.parse({ kind: 'free_shipping', automatic: true, eligibility: { phones: ['98765 43210', '+919876543210'] } });
    expect(ok.eligibility.phones).toEqual(['+919876543210']);
    expect(couponInputSchema.safeParse({ kind: 'free_shipping', automatic: true, eligibility: { phones: ['12'] } }).success).toBe(false);
    const dates = couponInputSchema.safeParse({ kind: 'free_shipping', automatic: true, limits: { startsAt: '2026-10-20T00:00:00+05:30', endsAt: '2026-10-10T00:00:00+05:30' } });
    expect(dates.success).toBe(false);
  });
});

describe('coupon words', () => {
  it('writes headlines from the rules', () => {
    expect(couponHeadline({ ...base, kind: 'amount_off', target: 'order', value: { type: 'percent', percent: 5 } })).toBe('Flat 5% off on total value');
    expect(couponHeadline({ ...base, kind: 'buy_x_get_y', buy: { quantity: 1, scope: {} }, get: { quantity: 1, scope: { collectionIds: ['1'] }, percentOff: 100 } })).toBe('Buy 1 Get 1 FREE');
    expect(couponHeadline({ ...base, kind: 'bundle', scope: { collectionIds: ['1'] }, bundleSize: 3, value: { type: 'bundle_price', price: 99900 } })).toBe('Any 3 for ₹999');
    expect(couponHeadline({ ...base, kind: 'payment_offer', methods: { upi: { type: 'percent', percent: 5 }, card: { type: 'fixed', amount: 5000 } } })).toBe('Extra 5% off on UPI, ₹50 off on cards');
    const gift: Coupon = { ...base, kind: 'free_gift', condition: { minSubtotal: 59900 }, gifts: [{ variantId: '1', productId: '2', title: 'Perfume', unitPrice: 4900, quantity: 1 }] };
    expect(couponHeadline(gift)).toBe('Free Perfume on orders above ₹599');
  });

  it('lists conditions and limits', () => {
    const c: Coupon = {
      ...base,
      kind: 'amount_off',
      target: 'order',
      value: { type: 'percent', percent: 10, maxDiscount: 20000 },
      condition: { minSubtotal: 49900 },
      eligibility: { orders: 'first' },
      limits: { combinable: false, perShopper: 1, disableCod: true, endsAt: '2026-10-31T18:29:00Z' },
    };
    expect(couponHeadline(c)).toBe('Flat 10% off (up to ₹200) on total value');
    expect(couponDetails(c)).toEqual([
      'Valid on a minimum purchase of ₹499',
      'Valid on your first order only',
      'Once per customer',
      'Valid on prepaid orders only',
      'Valid till 31 Oct 2026',
      'Cannot be combined with other offers',
    ]);
    expect(couponSummary(c).limits).toContain('COD disabled');
  });
});
