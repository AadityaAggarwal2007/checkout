/**
 * Shopify's storefront AJAX cart API (/cart.js etc.). Works on every theme; respects a locale
 * prefix (window.Shopify.routes.root). All amounts from Shopify are integer paise already.
 */
export interface ShopifyCartItem {
  key: string;
  id: number; // variant id
  product_id: number;
  title: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  original_price: number;
  final_line_price: number;
  image: string | null;
  url: string;
  handle: string;
  product_has_only_default_variant: boolean;
  properties: Record<string, string> | null;
}

export interface ShopifyCart {
  token: string;
  note: string | null;
  item_count: number;
  total_price: number;
  items: ShopifyCartItem[];
}

export interface ShopifyProductJson {
  id: number;
  handle: string;
  title: string;
  variants: Array<{ id: number; title: string; available: boolean; price: number; compare_at_price: number | null }>;
}

declare global {
  interface Window {
    Shopify?: { routes?: { root?: string } };
  }
}

const root = (): string => {
  const r = window.Shopify?.routes?.root ?? '/';
  return r.endsWith('/') ? r : `${r}/`;
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await nativeFetch(`${root()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { description?: string; message?: string };
    throw new Error(err.description || err.message || `cart request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** The page's fetch before we wrap it (index.ts wraps window.fetch to catch theme add-to-carts). */
export let nativeFetch: typeof fetch = (...a) => fetch(...a);
export function setNativeFetch(f: typeof fetch): void {
  nativeFetch = f;
}

export const cartApi = {
  get: () => call<ShopifyCart>('cart.js'),
  add: (variantId: number | string, quantity = 1, properties?: Record<string, string>) =>
    call<unknown>('cart/add.js', { items: [{ id: Number(variantId), quantity, properties }] }),
  change: (key: string, quantity: number) => call<ShopifyCart>('cart/change.js', { id: key, quantity }),
  note: (note: string) => call<ShopifyCart>('cart/update.js', { note }),
  clear: () => call<ShopifyCart>('cart/clear.js', {}),
  product: (handle: string) => call<ShopifyProductJson>(`products/${encodeURIComponent(handle)}.js`),
};
