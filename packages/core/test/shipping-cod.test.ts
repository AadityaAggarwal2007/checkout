import { describe, expect, it } from 'vitest';
import {
  decideRto,
  misleadingFreeName,
  partialCodSplit,
  price,
  quoteShipping,
  rewardProgress,
  type RtoSettings,
  type ShippingConfig,
} from '../src/index.js';
import { cart, kurtiyaShipping, line } from './fixtures.js';

describe('shipping', () => {
  it('never labels a charge as free, and tells how much more for free shipping', () => {
    const [opt] = quoteShipping(kurtiyaShipping, { merchandiseTotal: 12400, weightGrams: 0 });
    expect(opt).toMatchObject({ charge: 3000, label: 'Shipping', addForFree: 7500 });
    const [free] = quoteShipping(kurtiyaShipping, { merchandiseTotal: 19900, weightGrams: 0 });
    expect(free).toMatchObject({ charge: 0, label: 'Free shipping' });
  });

  it('warns about a rate named "Free shipping" that charges money (FlexyPe order #2246)', () => {
    const rate = { ...kurtiyaShipping.zones[0]!.rates[0]!, name: 'Free shipping' };
    expect(misleadingFreeName(rate)).toBe(true);
    expect(misleadingFreeName(kurtiyaShipping.zones[0]!.rates[0]!)).toBe(false);
  });

  const zones: ShippingConfig = {
    zones: [
      { id: 'north-east', name: 'North East', states: ['Assam', 'Meghalaya'], rates: [{ id: 'ne', name: 'NE', basis: 'weight', active: true, slabs: [{ min: 0, max: 500, charge: 9000, codAllowed: false }, { min: 500, charge: 15000, codAllowed: false }] }] },
      { id: 'rest', name: 'Rest of India', rates: [{ id: 'std', name: 'Standard', basis: 'price', active: true, blockedPincodes: ['110046'], slabs: [{ min: 0, charge: 0, codAllowed: true }] }] },
    ],
  };

  it('picks the zone by state and the slab by weight', () => {
    expect(quoteShipping(zones, { merchandiseTotal: 100, weightGrams: 600, address: { state: 'assam' } })[0]).toMatchObject({ rateId: 'ne', charge: 15000, codAllowed: false });
    expect(quoteShipping(zones, { merchandiseTotal: 100, weightGrams: 600, address: { state: 'Delhi' } })[0]).toMatchObject({ rateId: 'std' });
  });

  it('a blocked pincode is unserviceable', () => {
    const r = price({ cart: cart(line({ unitPrice: 1000 })), coupons: [], shipping: zones, address: { state: 'Delhi', pincode: '110046' } });
    expect(r.unserviceable).toBe(true);
    expect(r.codAvailability.cod).toBe(false);
  });

  it('a slab without COD switches COD off', () => {
    const r = price({ cart: cart(line({ unitPrice: 1000, weightGrams: 100 })), coupons: [], shipping: zones, address: { state: 'Assam' }, cod: { codEnabled: true, codFee: 0 } });
    expect(r.codAvailability.cod).toBe(false);
    expect(r.codAvailability.reasons).toContain('Cash on delivery is not available for this order value or location.');
  });
});

describe('RTO suite', () => {
  const settings: RtoSettings = {
    mode: 'all',
    rules: [
      { id: 'amount', active: true, priority: 1, when: { kind: 'cart_amount', max: 300000 }, then: { blockCod: true, blockPartialCod: false } },
      { id: 'pins', active: true, priority: 2, when: { kind: 'pincode', mode: 'list', pincodes: ['400001'] }, then: { blockCod: true, blockPartialCod: true } },
      { id: 'new', active: false, priority: 9, when: { kind: 'customer_type', type: 'new' }, then: { blockCod: true, blockPartialCod: true } },
    ],
  };
  const ctx = (total: number, pincode?: string) => ({ total, lines: [], shopper: {}, address: { pincode } });

  it('all rules together: strictest wins', () => {
    expect(decideRto(settings, ctx(400000, '400001'))).toMatchObject({ blockCod: true, blockPartialCod: true, matchedRuleIds: ['pins', 'amount'] });
    expect(decideRto(settings, ctx(400000))).toMatchObject({ blockCod: true, blockPartialCod: false });
    expect(decideRto(settings, ctx(100000))).toMatchObject({ blockCod: false, blockPartialCod: false });
  });

  it('single rule: only the highest priority match counts', () => {
    expect(decideRto({ ...settings, mode: 'single' }, ctx(400000, '400001'))).toMatchObject({ matchedRuleIds: ['pins'] });
  });

  it('cart over ₹3000 offers partial COD but not full COD', () => {
    const r = price({
      cart: cart(line({ unitPrice: 400000 })),
      coupons: [],
      shipping: kurtiyaShipping,
      rto: settings,
      cod: { codEnabled: true, codFee: 0, partial: { enabled: true, advance: { type: 'fixed', amount: 9900 } } },
    });
    expect(r.codAvailability).toMatchObject({ cod: false, partialCod: true });
  });
});

describe('partial COD and COD fee', () => {
  it('splits by fixed amount or percent, within min / max', () => {
    expect(partialCodSplit(50000, { enabled: true, advance: { type: 'fixed', amount: 9900 } })).toEqual({ payNow: 9900, payOnDelivery: 40100 });
    expect(partialCodSplit(50000, { enabled: true, advance: { type: 'percent', percent: 10 }, minAdvance: 9900 })).toEqual({ payNow: 9900, payOnDelivery: 40100 });
    expect(partialCodSplit(5000, { enabled: true, advance: { type: 'fixed', amount: 9900 } })).toEqual({ payNow: 5000, payOnDelivery: 0 });
  });

  it('adds the COD fee only for full COD', () => {
    const input = { cart: cart(line({ unitPrice: 50000 })), coupons: [], cod: { codEnabled: true, codFee: 4900 }, shipping: kurtiyaShipping };
    expect(price({ ...input, paymentMethod: 'cod' })).toMatchObject({ total: 54900, payNow: 0, payOnDelivery: 54900 });
    expect(price({ ...input, paymentMethod: 'upi' })).toMatchObject({ total: 50000, payNow: 50000 });
  });
});

describe('reward bar', () => {
  const tiers = [
    { id: 'ship', label: 'free shipping', threshold: 19900, kind: 'shipping' as const },
    { id: 'g1', label: 'Free gift', threshold: 29900, kind: 'gift' as const },
    { id: 'g2', label: 'Free gift', threshold: 59900, kind: 'gift' as const },
  ];
  it('says how far the next tier is', () => {
    expect(rewardProgress(tiers, 12400)).toMatchObject({ remaining: 7500, allReached: false, next: { id: 'ship' } });
    expect(rewardProgress(tiers, 70000)).toMatchObject({ allReached: true, progress: 1 });
  });
});
