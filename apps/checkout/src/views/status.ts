import type { UpiIntentInfo } from '@checkout/shared';
import { METHOD_LABELS } from '@checkout/shared/payments';
import type { App } from '../app.js';
import { isPhone } from '../bridge.js';
import { h, svg } from '../dom.js';
import { money } from '../format.js';
import { ICONS } from '../icons.js';
import { qrSvg } from '../qr.js';

const cancelButton = (app: App, text: string) => h('button', { class: 'btn alt', 'data-test': 'change-method', onclick: () => void app.cancelPayment() }, text);

/** Waiting for the gateway (desktop: the payment is in another tab), or the UPI QR / app links right here. */
export function processingView(app: App): HTMLElement {
  const method = app.state.payment.method;
  const upi = app.state.payment.upi;
  if (upi && upi.intent.startsWith('upi://pay?') && upi.expiresAt > Date.now()) return upiView(app, upi);
  if (method === 'upi' && app.ui.upiExpiresAt && Date.now() >= app.ui.upiExpiresAt) {
    return h(
      'div',
      { class: 'card center', 'data-test': 'processing' },
      h('h2', {}, 'The QR code has expired'),
      h('p', { class: 'muted' }, 'If you already paid, this page updates by itself in a moment. Otherwise start the payment again.'),
      cancelButton(app, 'Try again'),
    );
  }
  return h(
    'div',
    { class: 'card center', 'data-test': 'processing' },
    h('div', { class: 'spin' }),
    h('h2', {}, 'Waiting for your payment'),
    h('p', { class: 'muted' }, `Complete the ${method ? METHOD_LABELS[method] ?? 'online' : 'online'} payment in the payment window. This page updates by itself.`),
    app.ui.payUrl ? h('button', { class: 'btn', onclick: () => app.reopenPayment() }, 'Open payment page again') : null,
    cancelButton(app, 'Change payment method'),
  );
}

/** Other apps open the same payment through their own scheme, with the intent's own query string. */
const UPI_APPS: Array<[string, string]> = [
  ['Google Pay', 'tez://upi/pay?'],
  ['PhonePe', 'phonepe://pay?'],
  ['Paytm', 'paytmmp://pay?'],
];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Pay by UPI without leaving the page: the QR of the gateway's upi:// link (desktop) or buttons that open
 * the UPI apps (phone). The link comes from our server and is checked there; this page only draws it.
 * Nothing here decides the payment: the page keeps polling and the server confirms it with the gateway.
 */
function upiView(app: App, upi: UpiIntentInfo): HTMLElement {
  const amount = app.state.methods.find((m) => m.method === 'upi')?.payNow ?? app.state.summary.total;
  const query = upi.intent.slice('upi://pay?'.length);
  const left = h('b', {}, mmss(upi.expiresAt - Date.now()));
  const tick = window.setInterval(() => {
    if (!left.isConnected) return window.clearInterval(tick);
    const ms = upi.expiresAt - Date.now();
    left.textContent = mmss(ms);
    if (ms <= 0) {
      window.clearInterval(tick);
      app.render(); // shows "expired"
    }
  }, 1000);
  const phone = isPhone();
  return h(
    'div',
    { class: 'card center upi', 'data-test': 'upi-inline' },
    h('h2', {}, `Pay ${money(amount)} by UPI`),
    phone
      ? h(
          'div',
          { class: 'upi-apps' },
          h('a', { class: 'btn', href: upi.intent, target: '_top', 'data-test': 'upi-open' }, 'Open UPI app'),
          ...UPI_APPS.map(([name, scheme]) => h('a', { class: 'btn alt', href: scheme + query, target: '_top' }, name)),
        )
      : h('div', { class: 'upi-qr' }, qrSvg(upi.intent, 220)),
    h('p', { class: 'muted' }, phone ? 'Approve the payment in your UPI app, then come back here. This page updates by itself.' : 'Scan with Google Pay, PhonePe, Paytm or any UPI app. This page updates by itself once you pay.'),
    h('div', { class: 'hint' }, h('div', { class: 'spin' }), 'Waiting for your payment · ', h('span', { class: 'timer' }, 'expires in ', left)),
    cancelButton(app, 'Paying with another method? Cancel'),
  );
}

/** Thank-you. */
export function doneView(app: App): HTMLElement {
  const o = app.state.order!;
  return h(
    'div',
    { class: 'card center done', 'data-test': 'thank-you' },
    h('div', { class: 'tick' }, svg(ICONS.check, 'ck-i big')),
    h('h2', {}, 'Thank you! Your order is placed.'),
    h('p', { class: 'muted' }, 'Order ', h('b', { 'data-test': 'order-number' }, o.number)),
    h(
      'dl',
      { class: 'totals' },
      row('Order total', money(o.total)),
      o.paidAmount > 0 ? row('Paid', money(o.paidAmount)) : null,
      o.dueOnDelivery > 0 ? row('Pay on delivery', money(o.dueOnDelivery)) : null,
    ),
    app.state.address ? h('p', { class: 'muted small' }, `Delivering to ${app.state.address.name}, ${app.state.address.city} ${app.state.address.pincode}`) : null,
    h('button', { class: 'btn', 'data-test': 'continue-shopping', onclick: () => app.close() }, 'Continue shopping'),
  );
}

function row(label: string, value: string): HTMLElement {
  return h('div', { class: 'row' }, h('dt', {}, label), h('dd', {}, value));
}
