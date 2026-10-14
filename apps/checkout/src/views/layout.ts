import type { App } from '../app.js';
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';

const STEPS = [
  ['login', 'Mobile'],
  ['address', 'Address'],
  ['payment', 'Payment'],
] as const;

export function headerView(app: App): HTMLElement {
  const s = app.state;
  const current = s.step === 'processing' ? 'payment' : s.step;
  const index = STEPS.findIndex(([k]) => k === current);
  return h(
    'header',
    { class: 'ck-header' },
    h(
      'div',
      { class: 'ck-brand' },
      s.store.logoUrl ? h('img', { src: s.store.logoUrl, alt: s.store.name, class: 'ck-logo' }) : h('b', {}, s.store.name),
      h('button', { class: 'icon-btn', 'aria-label': 'Close checkout', 'data-test': 'close', onclick: () => app.close() }, svg(ICONS.close)),
    ),
    s.step === 'done'
      ? null
      : h(
          'ol',
          { class: 'ck-steps' },
          ...STEPS.map(([, label], i) => h('li', { class: i < index ? 'done' : i === index ? 'now' : '' }, h('span', {}, String(i + 1)), label)),
        ),
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
