import { serverApi } from './api.js';
import { Drawer } from './drawer.js';
import { startPreview } from './preview.js';
import { cartApi, nativeFetch, setNativeFetch } from './shopify-cart.js';

/**
 * Entry point loaded by the theme app embed:
 *   <script src="https://<server>/storefront/loader.js" data-key="<widget key>" defer></script>
 * Finds its key, loads the store's drawer config, then takes over the theme's cart:
 * add-to-cart forms, AJAX add-to-carts (fetch / XHR) and the cart icon open our drawer.
 */
declare global {
  interface Window {
    CheckoutDrawer?: { open(): void; close(): void; refresh(): Promise<void> };
    __ckLoaded?: boolean;
  }
}

(function boot() {
  if (window.__ckLoaded) return; // theme or app embed included us twice
  window.__ckLoaded = true;
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    [...document.querySelectorAll<HTMLScriptElement>('script[src*="/storefront/loader.js"]')].pop();
  if (!script) return;
  const src = new URL(script.src, location.href);
  // Manual install: data-key; Shopify app embed: data-shop (the store's *.myshopify.com domain).
  const key = script.dataset.key ?? src.searchParams.get('key');
  const shop = script.dataset.shop;
  if (!key && !shop) return;
  const api = serverApi(src.origin, key ? { key } : { shop: shop! });
  const storeKey = key ?? shop!;
  // Keep the original fetch for our own calls before wrapping the page's fetch.
  setNativeFetch(window.fetch.bind(window));
  if (script.dataset.preview !== undefined) return startPreview(api);

  const start = async () => {
    let config;
    try {
      config = await api.config();
    } catch {
      return; // our server is down: the theme's own cart keeps working
    }
    const countClass = (window as { __ckCartCountClass?: string }).__ckCartCountClass || config.drawer.settings.cartCountClass;
    const drawer = new Drawer({
      config,
      api,
      storeKey,
      onCount: (n) => updateThemeCount(countClass, n),
    });
    window.CheckoutDrawer = { open: () => drawer.open(), close: () => drawer.close(), refresh: () => drawer.refresh() };
    const openAfterAdd = () => (config.drawer.settings.openOnAdd ? drawer.open() : void drawer.refresh());
    captureForms(openAfterAdd);
    wrapFetch(openAfterAdd, () => void drawer.refresh().catch(() => undefined));
    wrapXhr(openAfterAdd);
    captureCartLinks(() => drawer.open());
    hideThemeDrawers();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void start());
  else void start();
})();

const ADD = /\/cart\/add(\.js)?(\?|$)/;
const CHANGE = /\/cart\/(change|update|clear)(\.js)?(\?|$)/;

function captureForms(after: () => void): void {
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.method.toLowerCase() !== 'post' || !ADD.test(form.action)) return;
      // "Buy it now" posts with a checkout flag: leave it to Shopify (our popup takes it in Phase 2).
      if ((e as SubmitEvent).submitter?.getAttribute('name') === 'checkout') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const body = new FormData(form);
      void nativeFetch(`${(window.Shopify?.routes?.root ?? '/').replace(/\/?$/, '/')}cart/add.js`, {
        method: 'POST',
        body,
        headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        credentials: 'same-origin',
      }).then((res) => (res.ok ? after() : res.json().then((j: { description?: string }) => alert(j.description ?? 'Could not add to cart'))));
    },
    true,
  );
}

function wrapFetch(afterAdd: () => void, afterChange: () => void): void {
  const original = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const result = original.call(this, input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'POST') {
      if (ADD.test(url)) void result.then((r) => r.ok && afterAdd());
      else if (CHANGE.test(url)) void result.then((r) => r.ok && afterChange());
    }
    return result;
  };
}

function wrapXhr(afterAdd: () => void): void {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { _ck?: string }, method: string, url: string | URL, ...rest: unknown[]) {
    this._ck = method.toUpperCase() === 'POST' ? String(url) : undefined;
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { _ck?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
    if (this._ck && ADD.test(this._ck)) this.addEventListener('load', () => this.status < 400 && afterAdd());
    return send.call(this, body);
  };
}

const CART_LINKS = ['a[href="/cart"]', 'a[href$="/cart"]', '[data-cart-toggle]', '.header__icon--cart', '.js-drawer-open-cart', '.site-header__cart', '.cart-icon-bubble'];

function captureCartLinks(open: () => void): void {
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as Element | null)?.closest?.(CART_LINKS.join(','));
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    },
    true,
  );
}

function hideThemeDrawers(): void {
  const style = document.createElement('style');
  style.textContent = 'cart-drawer,cart-notification,#cart-notification,.cart-drawer,#CartDrawer,.drawer--cart{display:none!important}';
  document.head.appendChild(style);
}

function updateThemeCount(cls: string, count: number): void {
  const sel = [`.${CSS.escape(cls)}`, '[data-cart-count]'].join(',');
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    el.textContent = String(count);
    el.hidden = count === 0;
  });
}

export { cartApi };
