import type { DrawerSettings, StorefrontConfig } from '@checkout/shared';
import type { ServerApi } from './api.js';
import { Drawer } from './drawer.js';
import type { ShopifyCart } from './shopify-cart.js';

/**
 * Dashboard live preview: the real drawer code inside an iframe, fed by postMessage
 * ({ type: 'ck:preview', drawer, upsells }) on every keystroke in the editor. No store calls.
 */
const SAMPLE: ShopifyCart = {
  token: 'preview',
  note: null,
  item_count: 3,
  total_price: 37200,
  items: [
    sample('p1', 1, 'Oxidised Jhumkas + Cream Box', 'Silver / pack-of-3', 2, 12400, 59900),
    sample('p2', 2, 'Cotton Straight Kurti', 'M', 1, 12400, 29900),
  ],
};

function sample(key: string, id: number, title: string, variant: string, quantity: number, price: number, compare: number) {
  const img = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${id * 70} 45% 85%)"/><circle cx="5" cy="4.5" r="2.4" fill="hsl(${id * 70} 50% 60%)"/></svg>`)}`;
  return {
    key, id, product_id: id, title: `${title} - ${variant}`, product_title: title, variant_title: variant, quantity, price,
    original_price: compare, final_line_price: price * quantity, image: img, url: '#', handle: key,
    product_has_only_default_variant: false, properties: null,
  };
}

export function startPreview(api: ServerApi): void {
  let drawer: Drawer | null = null;
  window.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string; drawer?: DrawerSettings; storeName?: string } | null;
    if (!data || data.type !== 'ck:preview' || !data.drawer) return;
    const config: StorefrontConfig = {
      storeName: data.storeName ?? 'Your store',
      version: 0,
      drawer: data.drawer,
      visibleCodes: [{ code: 'WELCOME10' }, { code: 'B1G1' }],
      checkout: { mode: 'shopify' },
    };
    if (!drawer) drawer = new Drawer({ config, api, storeKey: 'preview', preview: true, sampleCart: SAMPLE });
    else drawer.setConfig(config);
  });
  window.parent?.postMessage({ type: 'ck:preview-ready' }, '*');
}
