import type { PriceResponse, StorefrontConfig } from '@checkout/shared';
import { nativeFetch } from './shopify-cart.js';

export interface UpsellProduct {
  productId: string;
  handle: string;
  title: string;
  image?: string;
  variantId: string;
  price: number;
  compareAtPrice?: number;
  options: number;
}

/** Calls to our server. No cookies; the widget key identifies the store. */
export function serverApi(base: string, id: { key: string } | { shop: string }, testKey?: string) {
  // testKey = the merchant opened the store with their test link: our checkout before it is switched on.
  const q = ('key' in id ? `key=${encodeURIComponent(id.key)}` : `shop=${encodeURIComponent(id.shop)}`) + (testKey ? `&test=${encodeURIComponent(testKey)}` : '');
  const url = (path: string) => `${base}${path}${path.includes('?') ? '&' : '?'}${q}`;
  return {
    async config(): Promise<StorefrontConfig> {
      const res = await nativeFetch(url('/storefront/config'), { credentials: 'omit' });
      if (!res.ok) throw new Error(`config ${res.status}`);
      return (await res.json()) as StorefrontConfig;
    },
    async price(lines: Array<{ lineId: string; variantId: string; quantity: number }>, codes: string[]): Promise<PriceResponse> {
      const res = await nativeFetch(url('/storefront/price'), {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines, codes }),
      });
      if (!res.ok) throw new Error(`price ${res.status}`);
      return (await res.json()) as PriceResponse;
    },
    /** Starts our checkout for these lines; answers the iframe URL (the token is in its #fragment). */
    async createCheckout(body: {
      lines: Array<{ variantId: string; quantity: number }>;
      codes: string[];
      note?: string;
      source: 'cart' | 'buy_now';
      attribution: Record<string, unknown>;
    }): Promise<{ url: string }> {
      const res = await nativeFetch(url('/storefront/checkout'), {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !json.url) throw new Error(json.message ?? `checkout ${res.status}`);
      return { url: json.url };
    },
    async upsells(): Promise<UpsellProduct[]> {
      const res = await nativeFetch(url('/storefront/upsells'), { credentials: 'omit' });
      if (!res.ok) return [];
      return ((await res.json()) as { products: UpsellProduct[] }).products;
    },
  };
}
export type ServerApi = ReturnType<typeof serverApi>;
