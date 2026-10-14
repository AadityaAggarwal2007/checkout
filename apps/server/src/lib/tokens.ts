import { SignJWT, jwtVerify } from 'jose';

/**
 * Short signed tokens (HS256) for: the dashboard login cookie, the Shopify OAuth state,
 * and the one-time "claim this store" link after an install. Every token has a purpose
 * ("aud") so one kind can never be replayed as another.
 */
export type TokenPurpose = 'session' | 'oauth_state' | 'store_claim';

export class Tokens {
  private readonly key: Uint8Array;

  constructor(secretBase64: string) {
    this.key = new Uint8Array(Buffer.from(secretBase64, 'base64'));
  }

  async sign(purpose: TokenPurpose, claims: Record<string, unknown>, ttlSeconds: number): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(purpose)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
      .sign(this.key);
  }

  /** Returns the claims, or null when the token is bad, expired or of another purpose. */
  async verify<T extends Record<string, unknown>>(purpose: TokenPurpose, token: string | undefined): Promise<T | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { audience: purpose, algorithms: ['HS256'] });
      return payload as T;
    } catch {
      return null;
    }
  }
}
