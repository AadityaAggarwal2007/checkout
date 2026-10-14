import { describe, expect, it } from 'vitest';
import { allocate, formatINR, paiseToRupeesString, percentOf, rupeesToPaise } from '../src/money.js';

describe('money', () => {
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise('199.99')).toBe(19999);
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise(1133.91)).toBe(113391);
    expect(rupeesToPaise('1259')).toBe(125900);
    expect(() => rupeesToPaise('12.345')).toThrow();
    expect(() => rupeesToPaise('abc')).toThrow();
  });

  it('formats Indian rupees', () => {
    expect(formatINR(18088700)).toBe('₹1,80,887');
    expect(formatINR(180887)).toBe('₹1,808.87');
    expect(formatINR(3000)).toBe('₹30');
    expect(formatINR(3000, { keepZeroPaise: true })).toBe('₹30.00');
    expect(formatINR(-950)).toBe('−₹9.50');
    expect(paiseToRupeesString(21050)).toBe('210.50');
  });

  it('rounds percentages half up to the paisa', () => {
    expect(percentOf(19000, 5)).toBe(950);
    expect(percentOf(999, 10)).toBe(100); // 99.9 -> 100
    expect(percentOf(12345, 12.5)).toBe(1543); // 1543.125
    expect(() => percentOf(100, 101)).toThrow();
  });

  it('allocates exactly, whatever the weights', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([7, 0]);
    for (let n = 0; n < 200; n++) {
      const weights = Array.from({ length: 1 + (n % 7) }, (_, i) => ((n * 37 + i * 101) % 997) + 1);
      const total = (n * 131) % 10007;
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });
});
