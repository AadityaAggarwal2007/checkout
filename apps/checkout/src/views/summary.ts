import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { money } from '../format.js';
import { ICONS } from '../icons.js';

/** Collapsible "Order summary": lines, offers, totals, ONE savings number (design rule 8). */
export function summaryView(app: App): HTMLElement {
  const s = app.state;
  const open = app.ui.summaryOpen;
  const toggle = () => {
    app.ui.summaryOpen = !open;
    app.render();
  };
  const sum = s.summary;
  return h(
    'section',
    { class: `ck-summary${open ? ' open' : ''}` },
    h(
      'button',
      { class: 'sum-bar', onclick: toggle, 'aria-expanded': String(open), 'data-test': 'summary-toggle' },
      h('span', {}, `Order summary · ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'}`),
      h('span', { class: 'sum-total' }, h('b', { 'data-test': 'summary-total' }, money(sum.total)), svg(ICONS.down, 'ck-i rot')),
    ),
    sum.savings > 0 ? h('div', { class: 'savings' }, `You are saving ${money(sum.savings)} on this order`) : null,
    open
      ? h(
          'div',
          { class: 'sum-body' },
          ...s.lines.map((l) =>
            h(
              'div',
              { class: 'line' },
              h('div', { class: 'thumb' }, l.image ? h('img', { src: l.image, alt: '' }) : null, h('span', { class: 'qty' }, String(l.quantity))),
              h('div', { class: 'line-info' }, h('div', { class: 'line-title' }, l.title), l.variantTitle ? h('div', { class: 'muted' }, l.variantTitle) : null, l.gift ? h('div', { class: 'gift' }, 'Free gift') : null, l.upsell ? h('button', { class: 'link small', 'data-test': 'upsell-remove', disabled: !!app.ui.busy, onclick: () => void app.run('upsell', async () => app.set((await app.api.upsell({ lineId: l.lineId })).state)) }, 'Remove') : null),
              h(
                'div',
                { class: 'line-price' },
                l.total < l.unitPrice * l.quantity || (l.compareAtPrice ?? 0) > l.unitPrice
                  ? h('s', {}, money((l.compareAtPrice && l.compareAtPrice > l.unitPrice ? l.compareAtPrice : l.unitPrice) * l.quantity))
                  : null,
                h('b', {}, l.total === 0 ? 'FREE' : money(l.total)),
              ),
            ),
          ),
          h(
            'dl',
            { class: 'totals' },
            row('Subtotal', money(sum.subtotal)),
            ...s.coupons.applied.filter((a) => a.amount > 0).map((a) => row(a.code ?? a.title ?? 'Offer', `−${money(a.amount)}`, 'green')),
            row(sum.shippingLabel + (sum.shippingEta ? ` (${sum.shippingEta})` : ''), sum.shipping === 0 ? 'FREE' : money(sum.shipping)),
            row('Total', money(sum.total), 'strong'),
          ),
        )
      : null,
  );
}

function row(label: string, value: string, cls = ''): HTMLElement {
  return h('div', { class: `row ${cls}` }, h('dt', {}, label), h('dd', {}, value));
}
