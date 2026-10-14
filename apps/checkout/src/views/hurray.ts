import type { CheckoutState } from '@checkout/shared';
import type { App } from '../app.js';
import { h } from '../dom.js';
import { money } from '../format.js';

/**
 * The offer to celebrate: the one the shopper just typed (code), else the one that saves the most.
 * A free-gift offer saves what the gift lines are worth.
 */
export function pickOffer(s: CheckoutState, code?: string): { name: string; saved: number } | null {
  // The most valuable free gift (each gift is its own offer).
  const topGift = s.lines.filter((l) => l.gift).sort((a, b) => b.unitPrice * b.quantity - a.unitPrice * a.quantity)[0];
  const giftValue = topGift ? topGift.unitPrice * topGift.quantity : 0;
  const applied = s.coupons.applied.map((a) => ({ name: a.code ?? a.title ?? 'Offer', saved: a.amount > 0 ? a.amount : 0, isCode: a.code?.toUpperCase() === code?.toUpperCase() }));
  if (applied.length === 0) return null;
  if (code) {
    const typed = applied.find((a) => a.isCode);
    return typed ? { name: typed.name, saved: typed.saved || giftValue } : null;
  }
  const best = [...applied].sort((a, b) => b.saved - a.saved)[0]!;
  if (best.saved > 0 && best.saved >= giftValue) return { name: best.name, saved: best.saved };
  if (topGift && giftValue > 0) return { name: topGift.title, saved: giftValue };
  return best.saved > 0 ? { name: best.name, saved: best.saved } : null;
}

/** "Hurray! X applied successfully. You saved ₹399 with this coupon." */
export function hurrayView(app: App, offer: { name: string; saved: number }): HTMLElement {
  const close = () => {
    app.ui.hurray = undefined;
    app.render();
  };
  return h(
    'div',
    { class: 'modal hurray', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Offer applied', 'data-test': 'hurray', onclick: (e: Event) => e.target === e.currentTarget && close() },
    h(
      'div',
      { class: 'sheet center' },
      h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×'),
      h('div', { class: 'popper', 'aria-hidden': 'true' }, '🎉'),
      h('h2', {}, 'Hurray!'),
      h('p', {}, `${offer.name.toUpperCase()} applied successfully.`),
      h('p', { class: 'saved' }, `You saved ${money(offer.saved)} with this coupon.`),
      h('button', { class: 'yay', onclick: close }, 'Yay, Thanks!'),
    ),
  );
}
