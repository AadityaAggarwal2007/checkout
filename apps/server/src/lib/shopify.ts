import { hmacBase64, hmacHex, safeEqual } from './crypto.js';

/** xyz.myshopify.com only — never let a user-supplied host into an OAuth redirect. */
export const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

export function normaliseShop(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const shop = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return SHOP_DOMAIN.test(shop) ? shop : null;
}

/**
 * Verifies the `hmac` Shopify adds to OAuth / app URLs: sorted query params (without hmac /
 * signature) joined as k=v&k=v, HMAC-SHA256 hex with the app secret.
 */
export function verifyQueryHmac(query: Record<string, unknown>, secret: string): boolean {
  const given = typeof query.hmac === 'string' ? query.hmac : '';
  if (!given || !secret) return false;
  const message = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => {
      const v = query[k];
      return `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`;
    })
    .join('&');
  return safeEqual(hmacHex(secret, message), given);
}

/** Webhook body check: X-Shopify-Hmac-Sha256 = base64 HMAC-SHA256 of the raw body. */
export function verifyWebhookHmac(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  return safeEqual(hmacBase64(secret, rawBody), header);
}

export interface ShopifyApi {
  exchangeCode(shop: string, code: string): Promise<{ accessToken: string; scope: string }>;
  shopInfo(shop: string, accessToken: string): Promise<{ name: string; domain: string | null; currency: string }>;
}

export function shopifyApi(opts: { apiKey: string; apiSecret: string; apiVersion: string; fetch?: typeof fetch }): ShopifyApi {
  const http = opts.fetch ?? fetch;
  return {
    async exchangeCode(shop, code) {
      const res = await http(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: opts.apiKey, client_secret: opts.apiSecret, code }),
      });
      if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status})`);
      const body = (await res.json()) as { access_token?: string; scope?: string };
      if (!body.access_token) throw new Error('Shopify token exchange returned no token');
      return { accessToken: body.access_token, scope: body.scope ?? '' };
    },
    async shopInfo(shop, accessToken) {
      const res = await http(`https://${shop}/admin/api/${opts.apiVersion}/shop.json`, {
        headers: { 'x-shopify-access-token': accessToken, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Shopify shop.json failed (${res.status})`);
      const { shop: s } = (await res.json()) as { shop: { name: string; domain?: string; currency?: string } };
      return { name: s.name, domain: s.domain ?? null, currency: s.currency ?? 'INR' };
    },
  };
}
