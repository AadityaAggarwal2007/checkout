import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/**
 * Encryption for stored secrets (Shopify tokens, gateway keys, WhatsApp tokens).
 * AES-256-GCM; output "v1.<keyId>.<iv>.<tag>.<ciphertext>" (base64url parts).
 * The keyring is "id:base64,id2:base64": the FIRST key encrypts, any listed key decrypts.
 */
export class Keyring {
  private readonly keys = new Map<string, Buffer>();
  private readonly currentId: string;

  constructor(spec: string) {
    const entries = spec.split(',').map((s) => s.trim()).filter(Boolean);
    if (entries.length === 0) throw new Error('ENCRYPTION_KEYS is empty');
    for (const entry of entries) {
      const [id, b64] = entry.split(':');
      const key = Buffer.from(b64 ?? '', 'base64');
      if (!id || key.length !== 32) throw new Error(`encryption key "${id}" must be 32 bytes`);
      this.keys.set(id, key);
    }
    this.currentId = entries[0]!.split(':')[0]!;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.currentId)!, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.currentId, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
  }

  decrypt(sealed: string): string {
    const [version, id, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !id || !iv || !tag || data === undefined) throw new Error('not an encrypted value');
    const key = this.keys.get(id);
    if (!key) throw new Error(`unknown encryption key "${id}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(sealed: string): T {
    return JSON.parse(this.decrypt(sealed)) as T;
  }

  /** True when the value was sealed with an older key (re-encrypt on next write). */
  needsRotation(sealed: string): boolean {
    return sealed.split('.')[1] !== this.currentId;
  }
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string | Buffer, input: string | Buffer): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

export function hmacBase64(secret: string | Buffer, input: string | Buffer): string {
  return createHmac('sha256', secret).update(input).digest('base64');
}

/** Constant-time string compare (different lengths -> false). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Peppered hash for lookups we never need to reverse (phone numbers, OTP codes, device tokens). */
export function pepperedHash(pepper: string, value: string): string {
  return hmacHex(Buffer.from(pepper, 'base64'), value);
}

// Passwords: scrypt N=2^15, r=8, p=1, 64-byte key. Stored "s1$<salt>$<hash>".
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('password too short');
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, SCRYPT);
  return `s1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 's1' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
