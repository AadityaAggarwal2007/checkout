import type { CheckoutMethod } from '@checkout/shared';
import { METHOD_LABELS } from '@checkout/shared/payments';
import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { formatPhone, money } from '../format.js';
import { ICONS } from '../icons.js';
import { addressLine, notYou } from './address.js';
import { upsellView } from './upsell.js';

const SUB: Record<string, string> = {
  upi: 'Google Pay, PhonePe, Paytm & more',
  card: 'Visa, Mastercard, RuPay',
  netbanking: 'All major banks',
  wallet: 'Paytm, Mobikwik & more',
  emi: 'Easy monthly instalments',
  pay_later: 'Simpl, LazyPay & more',
};

/** Step 3: where it goes, offers, and one row per payment method (tap = pay). */
export function paymentView(app: App): HTMLElement {
  const s = app.state;
  return h(
    'div',
    { class: 'stack' },
    s.payment.status === 'failed' ? h('div', { class: 'notice error', 'data-test': 'payment-failed' }, s.payment.message ?? 'Payment failed. Please try again.') : null,
    s.address
      ? h(
          'div',
          { class: 'card deliver' },
          svg(ICONS.pin),
          h('div', { class: 'addr-text' }, h('b', {}, `Deliver to ${s.address.name}`), h('span', { class: 'muted' }, addressLine(s.address)), h('span', { class: 'muted' }, formatPhone(s.customer?.phone ?? ''), ' · ', notYou(app))),
          h('button', {
            class: 'link',
            'data-test': 'change-address',
            onclick: () => void app.run('address', async () => app.set((await app.api.editAddress()).state)),
          }, 'Change'),
        )
      : null,
    s.upsell ? upsellView(app, s.upsell) : null,
    couponsView(app),
    s.unserviceable
      ? h('div', { class: 'notice error' }, 'Sorry, we do not deliver to this pincode yet. Please choose another address.')
      : h(
          'div',
          { class: 'card methods' },
          h('h2', {}, 'Choose a payment method'),
          prepaidBanner(s.methods),
          ...s.methods.map((m) => methodRow(app, m, sameSaving(s.methods))),
          s.methods.length === 0 ? h('p', { class: 'muted' }, 'No payment method is available for this order. Please contact the store.') : null,
          !s.methods.some((m) => m.method === 'cod') && s.codReasons.length ? h('p', { class: 'muted small' }, s.codReasons[0]!) : null,
        ),
    app.ui.confirmCod ? codConfirm(app, app.ui.confirmCod) : null,
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
      : SUB[m.method] ?? '';
  const onclick = () => {
    if (cash && app.state.settings.codConfirm) {
      app.ui.confirmCod = m;
      return app.render();
    }
    void app.pay(m);
  };
  return h(
    'button',
    { class: 'method', 'data-test': `method-${m.method}`, disabled: !!app.ui.busy, onclick },
    h('span', { class: 'm-text' }, h('b', {}, METHOD_LABELS[m.method] ?? m.method), h('span', { class: 'muted' }, sub), m.extraSaving > 0 && !savingInBanner ? h('span', { class: 'save' }, `Save ${money(m.extraSaving)}`) : null),
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

function couponsView(app: App): HTMLElement {
  const c = app.state.coupons;
  const apply = (code: string) =>
    void app.run('coupon', async () => {
      const res = await app.api.coupon({ add: code });
      app.set(res.state);
      const rejected = res.state.coupons.rejected.find((r) => r.code === code.toUpperCase());
      if (rejected) app.ui.notice = { kind: 'error', text: rejected.message };
      else app.ui.couponInput = '';
    });
  return h(
    'div',
    { class: 'card coupons' },
    h(
      'button',
      {
        class: 'coupon-head',
        'data-test': 'coupons-toggle',
        onclick: () => {
          app.ui.couponOpen = !app.ui.couponOpen;
          app.render();
        },
      },
      svg(ICONS.tag),
      h('span', {}, c.applied.length ? `${c.applied.length} offer${c.applied.length > 1 ? 's' : ''} applied` : 'Apply a coupon'),
      svg(ICONS.down, `ck-i${app.ui.couponOpen ? ' rot' : ''}`),
    ),
    c.applied.length
      ? h(
          'div',
          { class: 'applied' },
          ...c.applied.map((a) =>
            h(
              'span',
              { class: 'applied-chip' },
              `${a.code ?? a.title ?? 'Offer'}${a.amount > 0 ? ` · −${money(a.amount)}` : ''}`,
              a.code ? h('button', { class: 'x', 'aria-label': `Remove ${a.code}`, onclick: () => void app.run('coupon', async () => app.set((await app.api.coupon({ remove: a.code })).state)) }, '×') : null,
            ),
          ),
        )
      : null,
    app.ui.couponOpen
      ? h(
          'div',
          { class: 'coupon-body' },
          h(
            'form',
            {
              class: 'coupon-form',
              onsubmit: (e: Event) => {
                e.preventDefault();
                if (app.ui.couponInput.trim()) apply(app.ui.couponInput.trim());
              },
            },
            h('input', { placeholder: 'Enter coupon code', value: app.ui.couponInput, 'data-key': 'coupon', 'data-test': 'coupon-input', oninput: (e: Event) => (app.ui.couponInput = (e.target as HTMLInputElement).value.toUpperCase()) }),
            h('button', { class: 'btn small', type: 'submit', disabled: app.ui.busy === 'coupon' }, 'Apply'),
          ),
          ...c.visible
            .filter((v) => !c.applied.some((a) => a.code === v.code))
            .map((v) => h('button', { class: 'offer', onclick: () => apply(v.code) }, h('b', {}, v.code), v.title ? h('span', { class: 'muted' }, v.title) : null, h('span', { class: 'link' }, 'Apply'))),
        )
      : null,
  );
}
