import { METHOD_LABELS } from '@checkout/shared/payments';
import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { money } from '../format.js';
import { ICONS } from '../icons.js';

const cancelButton = (app: App, text: string) => h('button', { class: 'btn alt', 'data-test': 'change-method', onclick: () => void app.cancelPayment() }, text);

/** Waiting for the gateway (desktop: the payment is in another tab). An inline UPI QR shows in the payment view instead. */
export function processingView(app: App): HTMLElement {
  const method = app.state.payment.method;
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
