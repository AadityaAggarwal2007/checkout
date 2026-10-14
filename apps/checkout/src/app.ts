import type { CheckoutMethod, CheckoutState } from '@checkout/shared';
import { api, ApiError, device, type Api } from './api.js';
import { close, isPhone, toStore } from './bridge.js';
import { h } from './dom.js';
import { addressView } from './views/address.js';
import { headerView, footerView } from './views/layout.js';
import { loginView } from './views/login.js';
import { paymentView } from './views/payment.js';
import { exitView, wantsExitPrompt } from './views/exit.js';
import { doneView, processingView } from './views/status.js';
import { summaryView } from './views/summary.js';

/** Page-only state (what the server does not need to know). */
export interface Ui {
  phone: string;
  challengeId?: string;
  maskedPhone?: string;
  /** Local trial only: the code the dev sender "sent". */
  devCode?: string;
  resendAt: number;
  code: string;
  addressForm: boolean;
  form: Record<string, string>;
  formError?: string;
  couponInput: string;
  couponOpen: boolean;
  summaryOpen: boolean;
  confirmCod?: CheckoutMethod;
  /** Exit popup: shown once per visit. */
  exitOpen?: boolean;
  exitAsked?: boolean;
  exitReason?: string;
  /** Upsell: the option picked per offered product. */
  upsellVariant: Record<string, string>;
  /** Gateway URL of the open payment (desktop: "Reopen payment page"). */
  payUrl?: string;
  /** When the UPI QR / app links shown in this page stop being offered (unix ms). */
  upiExpiresAt?: number;
  /** Phone: the UPI app tile tapped (its scheme), opened as soon as the gateway gives the payment link. */
  upiApp?: string;
  busy?: string;
  notice?: { kind: 'error' | 'info'; text: string };
}

function bannerView(s: CheckoutState): HTMLElement | null {
  const step = s.step === 'login' || s.step === 'address' || s.step === 'payment' ? s.step : null;
  const text = step ? s.settings.banners[step] : undefined;
  return text ? h('div', { class: 'banner', 'data-test': 'banner' }, text) : null;
}

export class App {
  state!: CheckoutState;
  readonly ui: Ui = { phone: '', resendAt: 0, code: '', addressForm: false, form: { tag: 'HOME' }, couponInput: '', couponOpen: false, summaryOpen: false, upsellVariant: {} };
  readonly api: Api;
  private poll?: number;
  private gatewayWindow: Window | null = null;

  constructor(
    private readonly root: HTMLElement,
    token: string,
  ) {
    this.api = api(token);
    window.addEventListener('message', (e) => {
      // The gateway result page (same origin) tells us when the payment ended.
      if (e.origin !== window.location.origin) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'ck:paid' || type === 'ck:failed') void this.refresh();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state?.step === 'processing') void this.refresh();
    });
  }

  async start(): Promise<void> {
    this.root.replaceChildren(h('div', { class: 'ck-loading' }, h('div', { class: 'spin' }), h('p', {}, 'Creating your order…')));
    try {
      const { state } = await this.api.session();
      this.set(state);
      toStore({ type: 'ck:ready' });
    } catch (err) {
      this.fatal(err);
    }
  }

  /** Runs an action with a busy flag; errors become a notice (409 price_changed brings a new state). */
  async run(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.ui.busy) return;
    this.ui.busy = name;
    this.ui.notice = undefined;
    this.render();
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 && err.code === 'session_expired') return this.fatal(err);
        if (err.status === 401 && err.code === 'login_needed') device.set(undefined);
        const state = err.body.state as CheckoutState | undefined;
        if (state) this.state = state;
        this.ui.notice = { kind: 'error', text: err.message };
      } else {
        this.ui.notice = { kind: 'error', text: 'Something went wrong. Please try again.' };
      }
    } finally {
      this.ui.busy = undefined;
      this.render();
    }
  }

  set(state: CheckoutState): void {
    const before = this.state?.step;
    this.state = state;
    // The store page empties the cart and reports the purchase to the merchant's pixel (no personal data).
    if (state.step === 'done' && before !== 'done') toStore({ type: 'ck:done', order: state.order ? { number: state.order.number, total: state.order.total } : undefined });
    this.syncPolling();
    this.render();
  }

  async refresh(): Promise<void> {
    try {
      const { state } = await this.api.session();
      this.set(state);
    } catch {
      /* next poll tries again */
    }
  }

  private syncPolling(): void {
    const want = this.state.step === 'processing';
    if (want && !this.poll) this.poll = window.setInterval(() => void this.refresh(), 2500);
    if (!want && this.poll) {
      window.clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  // ---------------------------------------------------------------- actions used by views

  async pay(m: CheckoutMethod, upiApp?: string): Promise<void> {
    const phone = isPhone();
    this.ui.upiApp = upiApp;
    // UPI on a gateway that can show its QR here: no tab; if the gateway then declines, the store page navigates.
    const inline = m.method === 'upi' && !!this.state.inlineUpi;
    // Desktop: open the tab inside the click (popup blockers), point it at the gateway when ready.
    const win = phone || inline ? null : window.open('about:blank', '_blank');
    if (win) {
      try {
        win.document.write('<p style="font:16px sans-serif;padding:24px">Opening secure payment…</p>');
      } catch {
        /* ignore */
      }
    }
    await this.run('pay', async () => {
      try {
        const res = await this.api.pay(m.method, m.total);
        this.ui.payUrl = undefined;
        this.ui.upiExpiresAt = undefined;
        if (res.upi) {
          this.ui.upiExpiresAt = res.upi.expiresAt;
          win?.close();
          if (phone && upiApp) this.openUpiApp(upiApp + res.upi.intent.slice('upi://pay?'.length));
        } else if (res.pay) {
          this.ui.payUrl = res.pay.url;
          if (win && !win.closed) {
            win.location.href = res.pay.url;
            this.gatewayWindow = win;
          } else {
            this.go(res.pay.url);
          }
        } else win?.close();
        this.set(res.state);
      } catch (err) {
        win?.close();
        throw err;
      }
    });
  }

  /** Opens the UPI app (the store page does it: the tap was inside this frame). If the phone blocks it, the tiles stay as links. */
  openUpiApp(url: string): void {
    if (window.parent !== window) toStore({ type: 'ck:open-upi', url });
    else window.location.href = url;
  }

  /** Same-tab navigation to our gateway page: the store page does it (an iframe cannot move the top page). */
  go(url: string): void {
    if (window.parent !== window) toStore({ type: 'ck:navigate', url });
    else window.location.href = url;
  }

  reopenPayment(): void {
    if (!this.ui.payUrl) return;
    if (isPhone()) return this.go(this.ui.payUrl);
    this.gatewayWindow = window.open(this.ui.payUrl, '_blank');
  }

  /** A UPI QR of this page is open (or just expired): the payment list stays on screen around it. */
  upiInline(): boolean {
    const p = this.state.payment;
    return this.state.step === 'processing' && p.method === 'upi' && (!!p.upi || !!this.ui.upiExpiresAt);
  }

  /** Coupon / address changes while a UPI QR is open: the open payment is let go first (the server refuses changes while paying). */
  async edit(name: string, fn: () => Promise<void>): Promise<void> {
    await this.run(name, async () => {
      if (this.state.step === 'processing') {
        this.ui.upiExpiresAt = undefined;
        this.set((await this.api.cancelPayment()).state);
      }
      await fn();
    });
  }

  async cancelPayment(): Promise<void> {
    this.gatewayWindow?.close();
    this.ui.upiExpiresAt = undefined;
    await this.run('cancel', async () => this.set((await this.api.cancelPayment()).state));
  }

  /** The X: asks once (exit popup per the merchant's settings), then goes back to the store. */
  close(force = false): void {
    if (!force && wantsExitPrompt(this)) {
      this.ui.exitAsked = true;
      this.ui.exitOpen = true;
      return this.render();
    }
    if (this.preview) return;
    close(this.state?.store.url ?? '/');
  }

  /** Dashboard live preview: sample data, no server calls. */
  preview = false;

  // ---------------------------------------------------------------- render

  fatal(err: unknown): void {
    const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    this.root.replaceChildren(
      h(
        'div',
        { class: 'ck-loading' },
        h('p', { class: 'ck-fatal' }, message),
        h('button', { class: 'btn', onclick: () => (this.state ? this.close() : toStore({ type: 'ck:close' })) }, 'Back to store'),
      ),
    );
  }

  render(): void {
    const s = this.state;
    if (!s) return;
    const root = document.documentElement.style;
    root.setProperty('--primary', s.store.colors.primary);
    root.setProperty('--primary-text', s.store.colors.primaryText);
    root.setProperty('--accent', s.store.colors.accent);

    let body: HTMLElement;
    switch (s.step) {
      case 'login':
        body = loginView(this);
        break;
      case 'address':
        body = addressView(this);
        break;
      case 'payment':
        body = paymentView(this);
        break;
      case 'processing':
        body = this.upiInline() ? paymentView(this) : processingView(this);
        break;
      case 'done':
        body = doneView(this);
        break;
    }
    const focused = document.activeElement as HTMLElement | null;
    const focusKey = focused?.getAttribute('data-key');
    this.root.replaceChildren(
      h(
        'div',
        { class: 'ck-page' },
        headerView(this),
        this.ui.notice ? h('div', { class: `notice ${this.ui.notice.kind}`, role: 'alert' }, this.ui.notice.text) : null,
        h('main', { class: 'ck-main' }, bannerView(s), s.step === 'done' ? null : summaryView(this), body),
        footerView(this),
        this.ui.exitOpen ? exitView(this) : null,
      ),
    );
    // Keep the cursor where the shopper was typing.
    if (focusKey) (this.root.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
  }
}
