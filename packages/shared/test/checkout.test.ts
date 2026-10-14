import { describe, expect, it } from 'vitest';
import { addressInputSchema, checkoutSettingsSchema, maskPhone, matchState, normalizeIndianMobile } from '../src/checkout.js';

describe('phone numbers', () => {
  it('accepts Indian mobiles in any common form', () => {
    for (const v of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210']) {
      expect(normalizeIndianMobile(v)).toBe('+919876543210');
    }
  });
  it('refuses landlines, short numbers and other countries', () => {
    for (const v of ['5876543210', '987654321', '+1 415 555 0100', '', undefined, '98765432100']) expect(normalizeIndianMobile(v)).toBeNull();
  });
  it('masks the middle digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98•••••210');
  });
});

describe('states and addresses', () => {
  it('maps common spellings to the list', () => {
    expect(matchState('NCT of Delhi')).toBe('Delhi');
    expect(matchState('orissa')).toBe('Odisha');
    expect(matchState('Jammu & Kashmir')).toBe('Jammu and Kashmir');
    expect(matchState('Narnia')).toBeUndefined();
  });
  it('validates the form', () => {
    const ok = addressInputSchema.safeParse({ name: 'Asha', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' });
    expect(ok.success).toBe(true);
    const bad = addressInputSchema.safeParse({ name: 'Asha', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '012345' });
    expect(bad.success).toBe(false);
  });
  it('fills checkout defaults', () => {
    const s = checkoutSettingsSchema.parse(undefined);
    expect(s.methodOrder[0]).toBe('upi');
    expect(s.askEmail).toBe('optional');
  });
});
