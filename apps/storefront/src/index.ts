import { serverApi } from './api.js';
import { CheckoutFrame } from './checkout-frame.js';
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
  const api = serverApi(src.origin, key ? { key } : { shop: shop! }, testMode());
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
    let frame: CheckoutFrame | undefined;
    const drawer: Drawer = new Drawer({
      config,
      api,
      storeKey,
      onCount: (n) => updateThemeCount(countClass, n),
      onCheckout: (lines, codes, note) => {
        drawer.close();
        void frame?.open(lines, { codes, note, source: 'cart' });
      },
    });
    if (config.checkout.mode === 'popup') {
      frame = new CheckoutFrame(api, config.checkout.url, () => void drawer.refresh().catch(() => undefined));
      captureCheckoutButtons(frame, () => drawer.store.state.codes);
      afterReturn(frame, () => void drawer.refresh().catch(() => undefined));
    }
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

/** ?ck_test=<key> once on the store (the merchant's test link) = our checkout in this tab before it is switched on. */
function testMode(): string | undefined {
  try {
    const key = new URLSearchParams(location.search).get('ck_test');
    if (key && /^[\w-]{1,40}$/.test(key)) sessionStorage.setItem('ck_test', key);
    return sessionStorage.getItem('ck_test') ?? undefined;
  } catch {
    return undefined;
  }
}

/** Theme cart page "Check out", links to /checkout and "Buy it now" open our checkout instead. */
function captureCheckoutButtons(frame: CheckoutFrame, codes: () => string[]): void {
  const fromCart = async () => {
    const cart = await cartApi.get();
    void frame.open(cart.items.map((i) => ({ variantId: String(i.id), quantity: i.quantity })), { codes: codes(), note: cart.note ?? '', source: 'cart' });
  };
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button[name="checkout"],input[name="checkout"],a[href="/checkout"],a[href$="/checkout"],.shopify-payment-button__button--unbranded');
      if (!el) return;
      const productForm = el.closest('form[action*="/cart/add"]') as HTMLFormElement | null;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (productForm) {
        // Buy it now: just this variant and quantity, the cart is left alone.
        const data = new FormData(productForm);
        const variantId = String(data.get('id') ?? '');
        const quantity = Math.max(1, Number(data.get('quantity') ?? 1) || 1);
        if (/^\d+$/.test(variantId)) void frame.open([{ variantId, quantity }], { source: 'buy_now' });
        return;
      }
      void fromCart();
    },
    true,
  );
}

/** Back on the store after paying on a phone: #ck_done = order placed (empty the cart), #ck_resume = try again. */
function afterReturn(frame: CheckoutFrame, refresh: () => void): void {
  const hash = location.hash;
  if (hash === '#ck_done') {
    void cartApi.clear().catch(() => undefined).then(refresh);
  } else if (hash.startsWith('#ck_resume=')) {
    frame.resume(decodeURIComponent(hash.slice('#ck_resume='.length)));
  } else return;
  history.replaceState(null, '', location.pathname + location.search);
}

const ADD = /\/cart\/add(\.js)?(\?|$)/;
const CHANGE = /\/cart\/(change|update|clear)(\.js)?(\?|$)/;

function captureForms(after: () => void): void {
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.method.toLowerCase() !== 'post' || !ADD.test(form.action)) return;
      // "Buy it now" posts with a checkout flag: Shopify's checkout, or ours (captureCheckoutButtons) in popup mode.
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
