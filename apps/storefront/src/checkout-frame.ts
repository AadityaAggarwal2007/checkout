import type { ServerApi } from './api.js';
import { h } from './dom.js';
import { pixel, purchase } from './pixel.js';
import { cartApi } from './shopify-cart.js';

/** upi://pay?… and the same link in the scheme of Google Pay, PhonePe, Paytm or CRED. */
export const UPI_LINK = /^(upi:\/\/pay|tez:\/\/upi\/pay|phonepe:\/\/pay|paytmmp:\/\/pay|credpay:\/\/upi\/pay)\?[^\s<>"'\\]{1,1000}$/;

/**
 * Our checkout in an iframe over the store page: a centred popup on desktop, full screen on
 * phones. The page inside is on our origin, so the store's scripts cannot read the OTP,
 * address or payment steps. It talks back with postMessage (checked against our origin).
 */
export class CheckoutFrame {
  private overlay?: HTMLElement;
  private readonly origin: string;
  private opening = false;

  constructor(
    private readonly api: ServerApi,
    checkoutUrl: string,
    private readonly onDone: () => void,
  ) {
    this.origin = new URL(checkoutUrl).origin;
    window.addEventListener('message', (e) => this.onMessage(e));
  }

  /** Cart / drawer / "Buy it now". Falls back to Shopify's checkout if ours cannot start. */
  async open(lines: Array<{ variantId: string; quantity: number }>, opts: { codes?: string[]; note?: string; source: 'cart' | 'buy_now' }): Promise<void> {
    if (this.opening || lines.length === 0) return;
    this.opening = true;
    this.show(null);
    pixel('InitiateCheckout', { num_items: lines.reduce((n, l) => n + l.quantity, 0) });
    try {
      const { url } = await this.api.createCheckout({ lines, codes: opts.codes ?? [], note: opts.note || undefined, source: opts.source, attribution: attribution() });
      this.show(url);
    } catch {
      this.hide();
      window.location.href = opts.source === 'buy_now' ? `/cart/${lines.map((l) => `${l.variantId}:${l.quantity}`).join(',')}` : '/checkout';
    } finally {
      this.opening = false;
    }
  }

  /** Back from a failed payment on a phone (#ck_resume=<token>): reopen the same checkout. */
  resume(token: string): void {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { sid?: string };
      if (payload.sid && /^[a-z0-9]{20,40}$/.test(payload.sid)) this.show(`${this.origin}/checkout/s/${payload.sid}#t=${encodeURIComponent(token)}`);
    } catch {
      /* not ours */
    }
  }

  private show(url: string | null): void {
    if (!this.overlay) {
      const host = h('div', { id: 'ck-checkout' });
      const root = host.attachShadow({ mode: 'open' });
      root.append(
        h('style', {}, STYLE),
        h('div', { class: 'back' }, h('div', { class: 'box' }, h('div', { class: 'wait' }, h('div', { class: 'spin' })))),
      );
      document.body.appendChild(host);
      document.documentElement.style.setProperty('overflow', 'hidden');
      this.overlay = host;
    }
    if (url) {
      const box = this.overlay.shadowRoot!.querySelector('.box')!;
      if (!box.querySelector('iframe')) {
        // The page inside only sees the popup's width: tell it whether this is a phone (same-tab payment).
        const device = window.matchMedia('(max-width: 640px)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'phone' : 'desktop';
        const frame = h('iframe', { src: `${url}&v=${device}`, title: 'Checkout', allow: 'payment; clipboard-write', referrerpolicy: 'no-referrer' }) as HTMLIFrameElement;
        box.appendChild(frame);
      }
    }
  }

  hide(): void {
    this.overlay?.remove();
    this.overlay = undefined;
    document.documentElement.style.removeProperty('overflow');
  }

  private onMessage(e: MessageEvent): void {
    if (e.origin !== this.origin) return;
    const msg = e.data as { type?: string; url?: string; order?: { number?: unknown; total?: unknown } } | null;
    switch (msg?.type) {
      case 'ck:ready':
        this.overlay?.shadowRoot?.querySelector('.wait')?.remove();
        break;
      case 'ck:close':
        this.hide();
        break;
      case 'ck:done':
        purchase(msg.order);
        void cartApi.clear().catch(() => undefined).then(() => this.onDone());
        break;
      case 'ck:navigate':
        // Only our own gateway hand-off page (phones pay in the same tab).
        if (typeof msg.url === 'string' && msg.url.startsWith(`${this.origin}/checkout/go/`)) window.location.href = msg.url;
        break;
      case 'ck:open-upi':
        // Only a UPI payment link for one of the known UPI apps (the checkout got it from our server).
        if (typeof msg.url === 'string' && UPI_LINK.test(msg.url)) window.location.href = msg.url;
        break;
    }
  }
}

/** Where the shopper came from (UTM, Meta click id): saved on the order for the dashboard. */
function attribution(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    const KEY = 'ck_attr';
    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    params.forEach((v, k) => {
      if (k.startsWith('utm_')) utm[k] = v.slice(0, 200);
    });
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
    const fresh = Object.keys(utm).length || params.get('fbclid') ? { landing: location.href.slice(0, 500), referrer: document.referrer.slice(0, 500), utm, fbclid: params.get('fbclid') ?? undefined } : null;
    if (fresh) sessionStorage.setItem(KEY, JSON.stringify(fresh));
    Object.assign(out, fresh ?? stored ?? { landing: location.href.slice(0, 500), referrer: document.referrer.slice(0, 500) });
    const cookie = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(`${n}=`))?.slice(n.length + 1);
    if (cookie('_fbp')) out.fbp = cookie('_fbp')!.slice(0, 200);
    if (cookie('_fbc')) out.fbc = cookie('_fbc')!.slice(0, 300);
  } catch {
    /* storage blocked */
  }
  return out;
}

const STYLE = `
.back{position:fixed;inset:0;z-index:2147483646;background:rgba(17,24,39,.55);display:flex;align-items:center;justify-content:center}
.box{position:relative;width:440px;height:min(760px,92vh);background:#F3F4F6;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent}
.wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#F3F4F6;z-index:1}
.spin{width:34px;height:34px;border:4px solid #E5E7EB;border-top-color:#111827;border-radius:50%;animation:s .9s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
@media (max-width:640px){.box{width:100%;height:100%;border-radius:0}}`;
