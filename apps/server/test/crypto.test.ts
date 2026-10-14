import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, hmacBase64, hmacHex, Keyring, verifyPassword } from '../src/lib/crypto.js';
import { normaliseShop, verifyQueryHmac, verifyWebhookHmac } from '../src/lib/shopify.js';

const key = () => randomBytes(32).toString('base64');

describe('keyring', () => {
  it('round-trips and never stores the plain text', () => {
    const ring = new Keyring(`k1:${key()}`);
    const sealed = ring.encrypt('shpat_123');
    expect(sealed).not.toContain('shpat');
    expect(ring.decrypt(sealed)).toBe('shpat_123');
    expect(ring.decryptJson(ring.encryptJson({ salt: 's' }))).toEqual({ salt: 's' });
  });

  it('decrypts with an old key after rotation and flags it for re-encryption', () => {
    const k1 = key();
    const old = new Keyring(`k1:${k1}`).encrypt('secret');
    const rotated = new Keyring(`k2:${key()},k1:${k1}`);
    expect(rotated.decrypt(old)).toBe('secret');
    expect(rotated.needsRotation(old)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt('x'))).toBe(false);
  });

  it('rejects tampered data', () => {
    const ring = new Keyring(`k1:${key()}`);
    const parts = ring.encrypt('secret').split('.');
    parts[4] = Buffer.from('other').toString('base64url');
    expect(() => ring.decrypt(parts.join('.'))).toThrow();
  });

  it('refuses short keys', () => {
    expect(() => new Keyring('k1:c2hvcnQ=')).toThrow();
  });
});

describe('passwords', () => {
  it('verifies only the right password', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('shopify signatures', () => {
  it('accepts only real *.myshopify.com shops', () => {
    expect(normaliseShop('https://Kurtiya-1.myshopify.com/admin')).toBe('kurtiya-1.myshopify.com');
    expect(normaliseShop('evil.com')).toBeNull();
    expect(normaliseShop('a.myshopify.com.evil.com')).toBeNull();
  });

  it('checks the query hmac over sorted params', () => {
    const q: Record<string, string> = { shop: 'a.myshopify.com', timestamp: '1700000000', code: 'abc', state: 'xyz' };
    const msg = 'code=abc&shop=a.myshopify.com&state=xyz&timestamp=1700000000';
    q.hmac = hmacHex('secret', msg);
    expect(verifyQueryHmac(q, 'secret')).toBe(true);
    expect(verifyQueryHmac({ ...q, shop: 'b.myshopify.com' }, 'secret')).toBe(false);
    expect(verifyQueryHmac(q, '')).toBe(false);
  });

  it('checks the webhook hmac over the raw body', () => {
    const body = Buffer.from('{"id":1}');
    expect(verifyWebhookHmac(body, hmacBase64('secret', body), 'secret')).toBe(true);
    expect(verifyWebhookHmac(Buffer.from('{"id":2}'), hmacBase64('secret', body), 'secret')).toBe(false);
  });
});
