import type { CheckoutMethod } from '@checkout/shared';
import { METHOD_LABELS } from '@checkout/shared/payments';
import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { formatPhone, money } from '../format.js';
import { ICONS } from '../icons.js';
import { addressLine, notYou } from './address.js';
import { upiSection } from './upi.js';
import { upsellView } from './upsell.js';

const ICON: Record<string, string> = { upi: ICONS.upi, card: ICONS.card, netbanking: ICONS.bank, wallet: ICONS.wallet, emi: ICONS.card, pay_later: ICONS.wallet, cod: ICONS.cash, partial_cod: ICONS.cash };


/** Step 3: where it goes, offers, and one row per payment method (tap = pay). */
export function paymentView(app: App): HTMLElement {
  const s = app.state;
  return h(
    'div',
    { class: 'stack' },
    s.payment.status === 'failed' ? h('div', { class: 'notice error', 'data-test': 'payment-failed' }, s.payment.message ?? 'Payment failed. Please try again.') : null,
    couponsView(app),
    s.address ? deliveryCard(app) : null,
    s.upsell ? upsellView(app, s.upsell) : null,
    s.unserviceable
      ? h('div', { class: 'notice error' }, 'Sorry, we do not deliver to this pincode yet. Please choose another address.')
      : h(
          'div',
          { class: 'card methods', 'data-test': 'pay-via' },
          h('h2', {}, 'Pay via'),
          prepaidBanner(s.methods),
          // The merchant's order (Checkout design); UPI is open (QR inside the page) when the gateway can do it.
          ...s.methods
            .map((m) => (m.method === 'upi' && s.inlineUpi ? upiSection(app, m, sameSaving(s.methods)) : methodRow(app, m, sameSaving(s.methods)))),
          s.methods.length === 0 ? h('p', { class: 'muted' }, 'No payment method is available for this order. Please contact the store.') : null,
          !s.methods.some((m) => m.method === 'cod') && s.codReasons.length ? h('p', { class: 'muted small' }, s.codReasons[0]!) : null,
        ),
    s.settings.trustBadges && !s.unserviceable
      ? h('div', { class: 'trust', 'data-test': 'trust' }, ...['100% secure payment', 'Encrypted & safe', 'Verified with OTP'].map((t) => h('span', {}, svg(ICONS.lock), t)))
      : null,
    accountCard(app),
    app.ui.confirmCod ? codConfirm(app, app.ui.confirmCod) : null,
  );
}

/** Account: who is logged in, and "Not you?" to forget this browser. */
function accountCard(app: App): HTMLElement | null {
  const c = app.state.customer;
  if (!c) return null;
  const open = !!app.ui.accountOpen;
  return h(
    'div',
    { class: 'card account' },
    h(
      'button',
      {
        class: 'acc-head',
        'data-test': 'account-toggle',
        'aria-expanded': String(open),
        onclick: () => {
          app.ui.accountOpen = !open;
          app.render();
        },
      },
      h('span', { class: 'm-icon' }, svg(ICONS.user)),
      h('span', {}, 'Account'),
      svg(ICONS.down, `ck-i${open ? ' rot' : ''}`),
    ),
    open ? h('div', { class: 'acc-body' }, h('span', {}, formatPhone(c.phone)), notYou(app)) : null,
  );
}

const online = (methods: CheckoutMethod[]) => methods.filter((m) => m.method !== 'cod' && m.method !== 'partial_cod');

/** True when every online method saves the same: say it once above the list instead of on each row. */
function sameSaving(methods: CheckoutMethod[]): boolean {
  const savings = new Set(online(methods).map((m) => m.extraSaving));
  return savings.size === 1;
}

function prepaidBanner(methods: CheckoutMethod[]): HTMLElement | null {
  const first = online(methods)[0];
  if (!first || first.extraSaving <= 0 || !sameSaving(methods)) return null;
  return h('div', { class: 'prepaid-banner', 'data-test': 'prepaid-banner' }, `Pay online and save ${money(first.extraSaving)}`);
}

function methodRow(app: App, m: CheckoutMethod, savingInBanner: boolean): HTMLElement {
  const cash = m.method === 'cod';
  const partial = m.method === 'partial_cod';
  const sub = partial
    ? `Pay ${money(m.payNow)} now, ${money(m.payOnDelivery)} on delivery`
    : cash
      ? m.codFee > 0
        ? `Includes ${money(m.codFee)} COD charge`
        : 'Pay when your order arrives'
      : '';
  const onclick = () => {
    if (cash && app.state.settings.codConfirm) {
      app.ui.confirmCod = m;
      return app.render();
    }
    void app.pay(m);
  };
  return h(
    'button',
    { class: `method${app.ui.picked === m.method && (app.ui.busy === 'pay' || app.state.step === 'processing') ? ' sel' : ''}`, 'data-test': `method-${m.method}`, disabled: !!app.ui.busy, onclick },
    h('span', { class: 'm-icon' }, svg(ICON[m.method] ?? ICONS.card)),
    h('span', { class: 'm-text' }, h('b', {}, app.state.settings.methodLabels[m.method] || METHOD_LABELS[m.method] || m.method), sub ? h('span', { class: 'muted' }, sub) : null, m.extraSaving > 0 && !savingInBanner ? h('span', { class: 'save' }, `Save ${money(m.extraSaving)}`) : null),
    h('span', { class: 'm-price' }, h('b', {}, money(partial ? m.payNow : m.total)), partial ? h('span', { class: 'muted small' }, 'now') : null),
    svg(ICONS.chevron),
  );
}

function codConfirm(app: App, m: CheckoutMethod): HTMLElement {
  const best = app.state.methods.filter((x) => x.method !== 'cod' && x.method !== 'partial_cod').sort((a, b) => b.extraSaving - a.extraSaving)[0];
  const dismiss = () => {
    app.ui.confirmCod = undefined;
    app.render();
  };
  return h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirm cash on delivery' },
    h(
      'div',
      { class: 'sheet' },
      h('h2', {}, 'Confirm your order'),
      h('p', {}, `Place this order with Cash on Delivery? You will pay ${money(m.total)} when it arrives.`),
      h('button', {
        class: 'btn',
        'data-test': 'confirm-cod',
        onclick: () => {
          app.ui.confirmCod = undefined;
          void app.pay(m);
        },
      }, `Confirm order · ${money(m.total)}`),
      best && best.total < m.total
        ? h('button', {
            class: 'btn alt',
            onclick: () => {
              app.ui.confirmCod = undefined;
              void app.pay(best);
            },
          }, `Pay online & save ${money(m.total - best.total)}`)
        : h('button', { class: 'btn alt', onclick: dismiss }, 'Go back'),
    ),
  );
}

const deliveryLabel = (l: string) => (/delivery/i.test(l) && !/free/i.test(l) ? l : 'Standard delivery');

/** "4-6 days" -> the last day of that range, "Friday, Oct 16" (India time). */
export function deliveryBy(eta: string | undefined, now = Date.now()): string | undefined {
  const days = eta?.match(/(\d+)\s*(?:-|to|–)?\s*(\d+)?\s*(business\s+)?days?/i);
  if (!days) return undefined;
  const n = Number(days[2] ?? days[1]);
  if (!Number.isFinite(n) || n < 0 || n > 60) return undefined;
  return new Date(now + n * 86_400_000).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Delivery details (Shiprocket style): who and where, then the delivery line. */
function deliveryCard(app: App): HTMLElement {
  const s = app.state;
  const a = s.address!;
  const email = s.email || s.customer?.email;
  const sum = s.summary;
  return h(
    'div',
    { class: 'card delivery', 'data-test': 'delivery' },
    h(
      'div',
      { class: 'd-head' },
      h('h2', {}, 'Delivery details'),
      h('button', { class: 'link', 'data-test': 'change-address', onclick: () => void app.edit('address', async () => app.set((await app.api.editAddress()).state)) }, 'Change'),
    ),
    h('div', { class: 'd-name' }, h('b', {}, a.name), a.tag ? h('span', { class: 'tagchip' }, a.tag.charAt(0) + a.tag.slice(1).toLowerCase()) : null),
    h('div', { class: 'd-addr' }, addressLine(a)),
    h('div', { class: 'd-contact muted' }, h('span', {}, svg(ICONS.phone), formatPhone(s.customer?.phone ?? '')), email ? h('span', {}, svg(ICONS.mail), email) : null),
    h(
      'div',
      { class: 'd-ship' },
      svg(ICONS.truck),
      h(
        'div',
        {},
        h('div', {}, h('b', {}, `${deliveryLabel(sum.shippingLabel)}:`), ' ', deliveryBy(sum.shippingEta) ?? sum.shippingEta ?? ''),
        h('div', { class: sum.shipping === 0 ? 'free' : 'muted small' }, sum.shipping === 0 ? 'Free shipping for you' : `Shipping ${money(sum.shipping)}`),
      ),
    ),
  );
}

function couponsView(app: App): HTMLElement {
  const c = app.state.coupons;
  const apply = (code: string) =>
    void app.edit('coupon', async () => {
      const res = await app.api.coupon({ add: code });
      app.set(res.state);
      const rejected = res.state.coupons.rejected.find((r) => r.code === code.toUpperCase());
      if (rejected) app.ui.notice = { kind: 'error', text: rejected.message };
      else {
        app.ui.couponInput = '';
        app.offerHurray(res.state, code);
      }
    });
  const offers = c.visible.filter((v) => !c.applied.some((a) => a.code === v.code));
  return h(
    'div',
    { class: 'card coupons' },
    h(
      'form',
      {
        class: 'coupon-form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (app.ui.couponInput.trim()) apply(app.ui.couponInput.trim());
        },
      },
      h(
        'label',
        { class: 'coupon-input' },
        h('span', { class: 'pct' }, '%'),
        h('input', { placeholder: 'Enter coupon code', value: app.ui.couponInput, 'data-key': 'coupon', 'data-test': 'coupon-input', oninput: (e: Event) => (app.ui.couponInput = (e.target as HTMLInputElement).value.toUpperCase()) }),
      ),
      h('button', { class: 'apply', type: 'submit', 'data-test': 'coupon-apply', disabled: app.ui.busy === 'coupon' }, 'Apply'),
    ),
    c.applied.some((a) => !a.automatic)
      ? h(
          'div',
          { class: 'applied' },
          ...c.applied.filter((a) => !a.automatic).map((a) =>
            h(
              'span',
              { class: 'applied-chip' },
              `${a.code ?? a.title ?? 'Offer'}${a.amount > 0 ? ` · −${money(a.amount)}` : ''}`,
              a.code ? h('button', { class: 'x', 'aria-label': `Remove ${a.code}`, onclick: () => void app.edit('coupon', async () => app.set((await app.api.coupon({ remove: a.code })).state)) }, '×') : null,
            ),
          ),
        )
      : null,
    offers.length
      ? h(
          'button',
          {
            class: 'unlock',
            'data-test': 'coupons-toggle',
            onclick: () => {
              app.ui.couponOpen = !app.ui.couponOpen;
              app.render();
            },
          },
          app.ui.couponOpen ? 'Hide coupons' : 'Unlock coupons',
          svg(app.ui.couponOpen ? ICONS.down : ICONS.chevron),
        )
      : null,
    app.ui.couponOpen && offers.length
      ? h('div', { class: 'coupon-body' }, ...offers.map((v) => h('button', { class: 'offer', onclick: () => apply(v.code) }, h('b', {}, v.code), v.title ? h('span', { class: 'muted' }, v.title) : null, h('span', { class: 'link' }, 'Apply'))))
      : null,
  );
}
