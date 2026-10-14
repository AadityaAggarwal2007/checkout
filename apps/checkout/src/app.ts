import type { CheckoutMethod, CheckoutState } from '@checkout/shared';
import { api, ApiError, device, type Api } from './api.js';
import { close, isPhone, toStore } from './bridge.js';
import { h } from './dom.js';
import { addressView } from './views/address.js';
import { headerView, footerView } from './views/layout.js';
import { loginView } from './views/login.js';
import { paymentView } from './views/payment.js';
import { doneView, processingView } from './views/status.js';
import { summaryView } from './views/summary.js';

/** Page-only state (what the server does not need to know). */
export interface Ui {
  phone: string;
  challengeId?: string;
  maskedPhone?: string;
  resendAt: number;
  code: string;
  addressForm: boolean;
  form: Record<string, string>;
  formError?: string;
  couponInput: string;
  couponOpen: boolean;
  summaryOpen: boolean;
  confirmCod?: CheckoutMethod;
  /** Gateway URL of the open payment (desktop: "Reopen payment page"). */
  payUrl?: string;
  busy?: string;
  notice?: { kind: 'error' | 'info'; text: string };
}

export class App {
  state!: CheckoutState;
  readonly ui: Ui = { phone: '', resendAt: 0, code: '', addressForm: false, form: { tag: 'HOME' }, couponInput: '', couponOpen: false, summaryOpen: false };
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
    if (state.step === 'done' && before !== 'done') toStore({ type: 'ck:done' });
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

  async pay(m: CheckoutMethod): Promise<void> {
    const phone = isPhone();
    // Desktop: open the tab inside the click (popup blockers), point it at the gateway when ready.
    const win = phone ? null : window.open('about:blank', '_blank');
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
        if (res.pay) {
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

  async cancelPayment(): Promise<void> {
    this.gatewayWindow?.close();
    await this.run('cancel', async () => this.set((await this.api.cancelPayment()).state));
  }

  close(): void {
    close(this.state?.store.url ?? '/');
  }

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
        body = processingView(this);
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
        s.step === 'done' ? null : summaryView(this),
        this.ui.notice ? h('div', { class: `notice ${this.ui.notice.kind}`, role: 'alert' }, this.ui.notice.text) : null,
        h('main', { class: 'ck-main' }, body),
        footerView(this),
      ),
    );
    // Keep the cursor where the shopper was typing.
    if (focusKey) (this.root.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
  }
}
