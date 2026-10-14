import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';

/** Store header (Shiprocket style): back arrow, the store's logo or name in the middle, then the store's line for this step. */
export function headerView(app: App): HTMLElement {
  const s = app.state;
  const step = s.step === 'processing' ? 'payment' : s.step;
  const line = step === 'login' || step === 'address' || step === 'payment' ? s.settings.banners[step] : undefined;
  return h(
    'header',
    { class: 'ck-header' },
    h(
      'div',
      { class: 'ck-brand' },
      h('button', { class: 'icon-btn back', 'aria-label': 'Close checkout', 'data-test': 'close', onclick: () => app.close() }, svg(ICONS.back)),
      s.store.logoUrl ? h('img', { src: s.store.logoUrl, alt: s.store.name, class: 'ck-logo' }) : h('b', {}, s.store.name),
    ),
    line ? h('div', { class: 'banner', 'data-test': 'banner' }, line) : null,
  );
}

export function footerView(app: App): HTMLElement {
  return h(
    'footer',
    { class: 'ck-footer' },
    h('span', { class: 'secure' }, svg(ICONS.lock), 'Secure checkout'),
    app.state.store.poweredBy ? h('span', {}, `Powered by ${app.state.store.poweredBy}`) : null,
  );
}
