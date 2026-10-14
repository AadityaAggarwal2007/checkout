import type { CheckoutMethod, CheckoutSettings, CheckoutState } from '@checkout/shared';
import { App } from './app.js';

/**
 * Dashboard > Checkout design live preview (/checkout/preview, same origin as the dashboard).
 * The dashboard posts { type: 'ck:design', settings, step, storeName } with settings already checked by
 * the shared zod schema (kept out of this bundle); nothing is sent to any server.
 */
type Step = 'login' | 'address' | 'payment' | 'exit';

const method = (m: CheckoutMethod['method'], total: number, extra = 0): CheckoutMethod => ({ method: m, total, payNow: m === 'cod' ? 0 : total, payOnDelivery: m === 'cod' ? total : 0, extraSaving: extra, codFee: 0 });

function sample(settings: CheckoutSettings, step: Step, storeName: string): CheckoutState {
  const all = [method('upi', 94050, 4950), method('card', 94050, 4950), method('netbanking', 94050, 4950), method('wallet', 94050, 4950), method('cod', 99000)];
  const hidden = new Set(settings.hiddenMethods);
  const methods = settings.methodOrder.filter((m) => !hidden.has(m)).map((m) => all.find((x) => x.method === m)).filter((m): m is CheckoutMethod => !!m);
  const shown = step === 'exit' ? 'payment' : step;
  return {
    id: 'preview',
    step: shown,
    store: { name: storeName, url: '#', logoUrl: settings.logoUrl, colors: settings.colors },
    settings: { askEmail: settings.askEmail, payButtonText: settings.payButtonText, codConfirm: true, methodLabels: settings.methodLabels, banners: settings.banners, trustBadges: settings.trustBadges, exit: settings.exit },
    customer: shown === 'login' ? null : { phone: '+919876543210', name: 'Asha Verma' },
    addresses: [],
    address: shown === 'payment' ? { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', tag: 'HOME' } : null,
    lines: [
      { lineId: 'p1', variantId: '1', title: 'Cotton Straight Kurti', variantTitle: 'M', quantity: 2, unitPrice: 49900, compareAtPrice: 79900, discount: 0, total: 99800, freeUnits: 0 },
    ],
    summary: { subtotal: 99800, discount: 4990, shipping: 4190, shippingLabel: 'Standard', shippingEta: '4-6 days', total: 99000, savings: 64990, itemCount: 2 },
    coupons: { applied: [{ code: 'WELCOME5', amount: 4990, automatic: false }], rejected: [], visible: [] },
    methods,
    upsell: null,
    codReasons: [],
    unserviceable: false,
    payment: { status: 'idle' },
    order: null,
  };
}

export function startPreview(root: HTMLElement): void {
  const app = new App(root, '');
  app.preview = true;
  let settings: CheckoutSettings | null = null;
  let step: Step = 'login';
  let storeName = 'Your store';
  const show = () => {
    if (!settings) return;
    app.ui.exitOpen = step === 'exit';
    app.ui.exitAsked = true;
    app.ui.addressForm = true;
    app.set(sample(settings, step, storeName));
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; settings?: unknown; step?: Step; storeName?: string } | null;
    if (d?.type !== 'ck:design') return;
    if (d.settings && typeof d.settings === 'object') settings = d.settings as CheckoutSettings;
    if (d.step) step = d.step;
    if (d.storeName) storeName = d.storeName;
    show();
  });
  // Clicks in the preview do nothing (no shopper, no server).
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button,a')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  window.parent.postMessage({ type: 'ck:preview-ready' }, window.location.origin);
}
