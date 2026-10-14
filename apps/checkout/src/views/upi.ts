import type { CheckoutMethod } from '@checkout/shared';
import { METHOD_LABELS } from '@checkout/shared/payments';
import type { App } from '../app.js';
import { isPhone } from '../bridge.js';
import { h, svg } from '../dom.js';
import { money } from '../format.js';
import { ICONS } from '../icons.js';
import { qrSvg } from '../qr.js';

/** Each app opens the same payment through its own scheme with the intent's query string; "Others" = the phone's chooser. */
export const UPI_APPS: Array<{ name: string; scheme: string; mark: string; cls: string }> = [
  { name: 'Google Pay', scheme: 'tez://upi/pay?', mark: 'G', cls: 'gpay' },
  { name: 'PhonePe', scheme: 'phonepe://pay?', mark: 'पे', cls: 'phonepe' },
  { name: 'Paytm', scheme: 'paytmmp://pay?', mark: 'paytm', cls: 'paytm' },
  { name: 'CRED UPI', scheme: 'credpay://upi/pay?', mark: 'C', cls: 'cred' },
  { name: 'Others', scheme: 'upi://pay?', mark: '+', cls: 'other' },
];

/** Drawn blurred behind "Show QR": not a payment, nothing to scan. */
const PLACEHOLDER = 'SHOW QR TO PAY';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const tileFace = (a: (typeof UPI_APPS)[number]) => [h('span', { class: `upi-logo ${a.cls}` }, a.mark), h('span', { class: 'upi-name' }, a.name)];

/**
 * "UPI payment" at the top of "Pay via", open by default (Shiprocket style).
 * Phone: one tile per UPI app; a tap starts the payment on our server (the gateway gives the upi:// link server
 * to server) and opens that app. Desktop: a blurred QR with "Show QR", then the real QR here.
 * Nothing here decides the payment: the page keeps polling and the server confirms it with the gateway.
 */
export function upiSection(app: App, m: CheckoutMethod, savingInBanner: boolean): HTMLElement {
  const s = app.state;
  const label = s.settings.methodLabels.upi || `${METHOD_LABELS.upi!} payment`;
  const waiting = s.step === 'processing' && s.payment.method === 'upi';
  const live = waiting ? s.payment.upi : undefined;
  return h(
    'div',
    { class: 'upi-box', 'data-test': 'upi-panel' },
    h(
      'div',
      { class: 'upi-head' },
      h('span', { class: 'm-icon' }, svg(ICONS.upi)),
      h('span', { class: 'm-text' }, h('b', {}, label), m.extraSaving > 0 && !savingInBanner ? h('span', { class: 'save' }, `Save ${money(m.extraSaving)}`) : null),
      h('span', { class: 'm-price' }, h('b', {}, money(m.total))),
      svg(ICONS.down),
    ),
    live && live.intent.startsWith('upi://pay?') && live.expiresAt > Date.now()
      ? liveBody(app, m, live.intent, live.expiresAt)
      : waiting
        ? h(
            'div',
            { class: 'upi-body col', 'data-test': 'upi-expired' },
            h('b', {}, 'The payment request has expired'),
            h('span', { class: 'muted small' }, 'If you already paid, this page updates by itself in a moment.'),
            h('button', { class: 'btn small', disabled: !!app.ui.busy, onclick: () => void app.pay(m) }, isPhone() ? 'Try again' : 'Show a new QR'),
          )
        : idleBody(app, m),
  );
}

function idleBody(app: App, m: CheckoutMethod): HTMLElement {
  const busy = app.ui.busy === 'pay';
  if (isPhone()) {
    return h(
      'div',
      { class: 'upi-body col' },
      h(
        'div',
        { class: 'upi-tiles' },
        ...UPI_APPS.map((a) =>
          h(
            'button',
            { class: `upi-tile${busy && app.ui.upiApp === a.scheme ? ' on' : ''}`, 'data-test': `upi-app-${a.cls}`, disabled: !!app.ui.busy, onclick: () => void app.pay(m, a.scheme) },
            ...tileFace(a),
          ),
        ),
      ),
      busy ? h('div', { class: 'hint' }, h('div', { class: 'spin' }), 'Opening your UPI app…') : null,
    );
  }
  return h(
    'div',
    { class: 'upi-body' },
    h(
      'div',
      { class: 'qr-wrap blur' },
      qrSvg(PLACEHOLDER, 140),
      h('button', { class: 'show-qr', 'data-test': 'show-qr', disabled: !!app.ui.busy, onclick: () => void app.pay(m) }, busy ? 'Loading…' : 'Show QR'),
    ),
    h('div', { class: 'upi-side' }, h('b', {}, 'Scan the QR code & pay via any UPI app'), h('span', { class: 'muted small' }, 'Google Pay, PhonePe, Paytm, CRED & more')),
  );
}

function liveBody(app: App, m: CheckoutMethod, intent: string, expiresAt: number): HTMLElement {
  const left = h('b', {}, mmss(expiresAt - Date.now()));
  const tick = window.setInterval(() => {
    if (!left.isConnected) return window.clearInterval(tick);
    const ms = expiresAt - Date.now();
    left.textContent = mmss(ms);
    if (ms <= 0) {
      window.clearInterval(tick);
      app.render(); // shows "expired"
    }
  }, 1000);
  const waiting = h('div', { class: 'upi-wait' }, h('div', { class: 'hint' }, h('div', { class: 'spin' }), 'Waiting for your payment'), h('span', { class: 'timer' }, 'expires in ', left));
  if (isPhone()) {
    const query = intent.slice('upi://pay?'.length);
    return h(
      'div',
      { class: 'upi-body col', 'data-test': 'upi-inline' },
      // Links, so a second tap always works even when the phone blocked the automatic open.
      h(
        'div',
        { class: 'upi-tiles' },
        ...UPI_APPS.map((a) =>
          h('a', { class: `upi-tile${app.ui.upiApp === a.scheme ? ' on' : ''}`, href: a.scheme + query, target: '_top', 'data-test': `upi-open-${a.cls}` }, ...tileFace(a)),
        ),
      ),
      h('span', { class: 'muted small' }, `Approve ${money(m.payNow)} in your UPI app, then come back here. App did not open? Tap it again.`),
      waiting,
    );
  }
  return h(
    'div',
    { class: 'upi-body', 'data-test': 'upi-inline' },
    h('div', { class: 'qr-wrap live' }, qrSvg(intent, 180)),
    h(
      'div',
      { class: 'upi-side' },
      h('b', {}, 'Scan the QR code & pay via any UPI app'),
      h('span', { class: 'muted small' }, `Amount ${money(m.payNow)}. This page updates by itself once you pay.`),
      waiting,
    ),
  );
}
