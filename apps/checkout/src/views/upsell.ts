import type { CheckoutUpsell } from '@checkout/shared';
import type { App } from '../app.js';
import { h } from '../dom.js';
import { money } from '../format.js';

const left = (endsAt: number) => {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

let ticking = 0;
/** One timer for the page: updates the countdown text in place; at 0 the state is read again (the offer ends). */
function tick(app: App): void {
  if (ticking) return;
  ticking = window.setInterval(() => {
    const el = document.querySelector<HTMLElement>('[data-ends]');
    if (!el) return;
    const ends = Number(el.dataset.ends);
    el.textContent = left(ends);
    if (Date.now() >= ends) {
      el.removeAttribute('data-ends');
      void app.refresh();
    }
  }, 1000);
}

/** "Add to your order": the merchant's offer for this cart, prices from the server, one tap adds one unit. */
export function upsellView(app: App, offer: CheckoutUpsell): HTMLElement {
  if (offer.endsAt) tick(app);
  return h(
    'div',
    { class: 'card upsell', 'data-test': 'upsell' },
    h(
      'div',
      { class: 'up-head' },
      h('h2', {}, offer.title),
      offer.endsAt ? h('span', { class: 'timer' }, 'Ends in ', h('b', { 'data-ends': String(offer.endsAt), 'data-test': 'upsell-timer' }, left(offer.endsAt))) : null,
    ),
    ...offer.items.map((item) => {
      const chosen = item.variants.find((v) => v.variantId === app.ui.upsellVariant[item.productId]) ?? item.variants[0]!;
      return h(
        'div',
        { class: 'up-item' },
        h('div', { class: 'thumb' }, item.image ? h('img', { src: item.image, alt: '' }) : null),
        h(
          'div',
          { class: 'line-info' },
          h('div', { class: 'line-title' }, item.title),
          item.variants.length > 1
            ? h(
                'select',
                {
                  class: 'up-variant',
                  'aria-label': `Option for ${item.title}`,
                  onchange: (e: Event) => {
                    app.ui.upsellVariant[item.productId] = (e.target as HTMLSelectElement).value;
                    app.render();
                  },
                },
                ...item.variants.map((v) => h('option', { value: v.variantId, selected: v.variantId === chosen.variantId }, v.title ?? 'Default')),
              )
            : null,
          h('div', { class: 'up-price' }, chosen.offerPrice < chosen.price ? h('s', {}, money(chosen.price)) : null, h('b', {}, money(chosen.offerPrice)), offer.percent ? h('span', { class: 'save' }, `${offer.percent}% off`) : null),
        ),
        h('button', {
          class: 'btn small alt',
          'data-test': `upsell-add-${chosen.variantId}`,
          disabled: !!app.ui.busy,
          onclick: () => void app.run('upsell', async () => app.set((await app.api.upsell({ variantId: chosen.variantId })).state)),
        }, 'Add'),
      );
    }),
  );
}
