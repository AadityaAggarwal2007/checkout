import { rewardProgress } from '@checkout/core';
import type { DrawerSettings, PricedCartLine } from '@checkout/shared';
import type { UpsellProduct } from '../api.js';
import { cssUrl, h, svg } from '../dom.js';
import { money, pct } from '../format.js';
import { BADGES, icon } from '../icons.js';
import type { ShopifyCartItem } from '../shopify-cart.js';
import type { State } from '../state.js';

export interface Actions {
  close(): void;
  setQuantity(key: string, quantity: number): void;
  changeVariant(item: ShopifyCartItem, variantId: string): void;
  loadVariants(handle: string): void;
  addUpsell(variantId: string): void;
  openCoupons(): void;
  closeSheet(): void;
  applyCode(code: string): void;
  removeCode(code: string): void;
  toggleNote(): void;
  setNote(note: string): void;
  setTerms(accepted: boolean): void;
  checkout(): void;
}

export function header(s: State, a: Actions): HTMLElement {
  const n = s.cart?.item_count ?? 0;
  return h(
    'div',
    { class: 'ck-head' },
    svg(icon('cart', 22)),
    h('h2', {}, `Your cart${n ? ` (${n})` : ''}`),
    h('button', { class: 'ck-x', 'aria-label': 'Close cart', onclick: () => a.close() }, svg(icon('close', 20, 2))),
  );
}

export function announcements(cfg: DrawerSettings['announcements']): HTMLElement | null {
  const messages = cfg.messages.filter(Boolean);
  if (!cfg.enabled || messages.length === 0) return null;
  const span = h('span', {}, messages[0]!);
  const bar = h('div', { class: 'ck-ann', role: 'status' }, span);
  if (cfg.mode === 'marquee') {
    bar.classList.add('ck-marquee');
    span.textContent = messages.join('   •   ');
    bar.style.setProperty('--dur', `${Math.max(10, messages.join('').length / 4)}s`);
  } else if (cfg.mode === 'rotate' && messages.length > 1) {
    let i = 0;
    const timer = window.setInterval(() => {
      if (!bar.isConnected) return window.clearInterval(timer);
      bar.classList.add('ck-fade');
      window.setTimeout(() => {
        i = (i + 1) % messages.length;
        span.textContent = messages[i]!;
        bar.classList.remove('ck-fade');
      }, 350);
    }, cfg.durationSec * 1000);
  }
  return bar;
}

export function rewardBar(cfg: DrawerSettings['rewardBar'], s: State): HTMLElement | null {
  if (!cfg.enabled || cfg.tiers.length === 0 || !s.cart) return null;
  const current = cfg.counting === 'value' ? s.priced?.total ?? s.cart.total_price : s.cart.item_count;
  const sorted = [...cfg.tiers].sort((x, y) => x.threshold - y.threshold);
  const p = rewardProgress(sorted, current);
  const title = p.allReached
    ? 'Congrats! You achieved this tier'
    : cfg.counting === 'value'
      ? `You're ${money(p.remaining)} away`
      : `Add ${p.remaining} more item${p.remaining === 1 ? '' : 's'}`;
  // Milestones sit at even steps; the fill advances segment by segment.
  const n = sorted.length;
  let fill = 100;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = sorted[i]!.threshold;
    if (current < t) {
      const span = t - prev;
      fill = (i / n) * 100 + (span > 0 ? (current - prev) / span : 0) * (100 / n);
      break;
    }
    prev = t;
  }
  const track = h('div', { class: 'ck-track' }, h('div', { class: 'ck-fill', style: `width:${Math.max(0, Math.min(100, fill))}%` }));
  sorted.forEach((t, i) => {
    const on = current >= t.threshold;
    const dot = h(
      'div',
      { class: `ck-dot${on ? ' ck-on' : ''}`, style: `left:${((i + 1) / n) * 100}%`, title: t.label },
      svg(icon(t.kind === 'shipping' ? 'truck' : t.kind === 'discount' ? 'percent' : 'gift', 15)),
      h('span', { class: 'ck-dot-l' }, t.label),
    );
    track.appendChild(dot);
  });
  return h('div', { class: 'ck-reward' }, h('div', { class: 'ck-reward-t' }, title), track);
}

function lineView(item: ShopifyCartItem, priced: PricedCartLine | undefined, s: State, a: Actions): HTMLElement {
  const st = s.config.drawer.settings;
  const unitCompare = priced?.compareAtPrice ?? (item.original_price > item.price ? item.original_price : undefined);
  const subtotal = priced?.subtotal ?? item.final_line_price;
  const total = priced?.total ?? item.final_line_price;
  const wasTotal = st.showCompareAt && unitCompare ? unitCompare * item.quantity : priced && priced.discount > 0 ? subtotal : undefined;
  const allFree = priced ? priced.total === 0 && priced.subtotal > 0 : false;

  const prices = h('div', { class: 'ck-prices' });
  if (wasTotal && wasTotal > total) prices.appendChild(h('span', { class: 'ck-was' }, money(wasTotal)));
  prices.appendChild(allFree ? h('span', { class: 'ck-free' }, 'Free') : h('span', { class: 'ck-now' }, money(total)));
  if (!allFree && wasTotal && wasTotal > total && st.showSavings) {
    prices.appendChild(h('span', { class: 'ck-off' }, `${pct(wasTotal - total, wasTotal)}% Off`));
  }

  let variantControl: HTMLElement | null = null;
  if (st.showVariantSelector && !item.product_has_only_default_variant) {
    const product = s.products.get(item.handle);
    if (product && product.variants.length > 1) {
      const sel = h('select', { class: 'ck-sel', 'aria-label': 'Change option' }) as HTMLSelectElement;
      for (const v of product.variants) {
        const o = h('option', { value: String(v.id), disabled: !v.available && v.id !== item.id }, v.title) as HTMLOptionElement;
        o.selected = v.id === item.id;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => a.changeVariant(item, sel.value));
      variantControl = sel;
    } else {
      a.loadVariants(item.handle);
      variantControl = h('span', { class: 'ck-l-var' }, item.variant_title ?? '');
    }
  } else if (item.variant_title && !item.product_has_only_default_variant) {
    variantControl = h('span', { class: 'ck-l-var' }, item.variant_title);
  }

  const props =
    st.showProperties && item.properties
      ? Object.entries(item.properties)
          .filter(([k, v]) => !k.startsWith('_') && v)
          .map(([k, v]) => h('span', { class: 'ck-l-var' }, `${k}: ${v}`))
      : [];

  const img = h('div', { class: 'ck-img', role: 'img', 'aria-label': item.product_title });
  if (item.image) img.style.backgroundImage = cssUrl(item.image);
  img.appendChild(h('span', { class: 'ck-qbadge' }, item.quantity));

  return h(
    'div',
    { class: 'ck-line' },
    img,
    h(
      'div',
      { class: 'ck-l-main' },
      h(
        'div',
        { class: 'ck-l-top' },
        h('div', { class: 'ck-l-title' }, item.product_title),
        h('button', { class: 'ck-del', 'aria-label': `Remove ${item.product_title}`, onclick: () => a.setQuantity(item.key, 0) }, svg(icon('trash', 17))),
      ),
      variantControl,
      ...props,
      h(
        'div',
        { class: 'ck-l-bottom' },
        prices,
        h(
          'div',
          { class: 'ck-step' },
          h('button', { 'aria-label': 'Decrease', onclick: () => a.setQuantity(item.key, item.quantity - 1) }, svg(icon('minus', 15, 2))),
          h('span', { 'aria-live': 'polite' }, item.quantity),
          h('button', { 'aria-label': 'Increase', onclick: () => a.setQuantity(item.key, item.quantity + 1) }, svg(icon('plus', 15, 2))),
        ),
      ),
    ),
  );
}

export function orderSummary(s: State, a: Actions): HTMLElement {
  const card = h('div', { class: `ck-card${s.busy ? ' ck-busy' : ''}` }, h('div', { class: 'ck-card-h' }, svg(icon('box', 18)), 'Order Summary'));
  const pricedByKey = new Map((s.priced?.lines ?? []).map((l) => [l.lineId, l]));
  const groups = s.priced?.groups ?? {};
  const shownGroups = new Map<string, HTMLElement>();
  for (const item of s.cart?.items ?? []) {
    const priced = pricedByKey.get(item.key);
    const view = lineView(item, priced, s, a);
    const gid = priced?.groupIds.find((g) => groups[g]);
    if (!gid) {
      card.appendChild(view);
      continue;
    }
    let box = shownGroups.get(groups[gid]!);
    if (!box) {
      box = h('div', { class: 'ck-group' }, h('div', { class: 'ck-group-h' }, svg(icon('checkCircle', 15)), groups[gid]!));
      shownGroups.set(groups[gid]!, box);
      card.appendChild(box);
    }
    box.appendChild(view);
  }
  for (const g of s.priced?.gifts ?? []) {
    const img = h('div', { class: 'ck-img' });
    if (g.image) img.style.backgroundImage = cssUrl(g.image);
    img.appendChild(h('span', { class: 'ck-qbadge' }, g.quantity));
    card.appendChild(
      h(
        'div',
        { class: 'ck-line' },
        img,
        h(
          'div',
          { class: 'ck-l-main' },
          h('div', { class: 'ck-l-top' }, h('div', { class: 'ck-l-title' }, g.title), h('span', { class: 'ck-chip' }, svg(icon('gift', 12)), 'Free Gift')),
          h('div', { class: 'ck-prices' }, h('span', { class: 'ck-was' }, money(g.unitPrice * g.quantity)), h('span', { class: 'ck-free' }, 'Free')),
        ),
      ),
    );
  }
  return card;
}

export function coupons(s: State, a: Actions): HTMLElement | null {
  if (!s.config.drawer.discountCodes.enabled) return null;
  const saved = s.priced?.savings ?? 0;
  return h(
    'div',
    { class: 'ck-coupon' },
    h('button', { class: 'ck-coupon-btn', onclick: () => a.openCoupons() }, h('span', { class: 'ck-coupon-ic' }, svg(icon('percent', 18, 2.2))), h('b', {}, 'Coupons'), svg(icon('chevronRight', 18))),
    saved > 0 ? h('div', { class: 'ck-saved' }, `You saved ${money(saved)} on this order 🎉`) : null,
  );
}

export function upsells(cfg: DrawerSettings['upsells'], list: UpsellProduct[], s: State, a: Actions): HTMLElement | null {
  const inCart = new Set((s.cart?.items ?? []).map((i) => String(i.product_id)));
  const show = list.filter((p) => !inCart.has(p.productId)).slice(0, cfg.max);
  if (!cfg.enabled || show.length === 0) return null;
  const row = h('div', { class: 'ck-ups' });
  for (const p of show) {
    const img = h('div', { class: 'ck-img' });
    if (p.image) img.style.backgroundImage = cssUrl(p.image);
    row.appendChild(
      h(
        'div',
        { class: 'ck-up' },
        img,
        h(
          'div',
          { class: 'ck-up-r' },
          h('div', { class: 'ck-up-t' }, p.title),
          h(
            'div',
            { class: 'ck-l-bottom' },
            h('div', { class: 'ck-prices' }, p.compareAtPrice ? h('span', { class: 'ck-was' }, money(p.compareAtPrice)) : null, h('span', { class: 'ck-now' }, money(p.price))),
            h('button', { class: 'ck-btn-o', disabled: s.busy, onclick: () => a.addUpsell(p.variantId) }, 'Add'),
          ),
        ),
      ),
    );
  }
  return h('div', { class: 'ck-card' }, h('div', { class: 'ck-card-h' }, svg(icon('bag', 18)), cfg.title), row);
}

export function notes(cfg: DrawerSettings['notes'], s: State, a: Actions): HTMLElement | null {
  if (!cfg.enabled) return null;
  const wrap = h('div', { class: 'ck-note' }, h('button', { class: 'ck-link', onclick: () => a.toggleNote() }, svg(icon('pencil', 15)), cfg.title));
  if (s.noteOpen) {
    const count = h('div', { class: 'ck-count' }, `${s.note.length}/${cfg.maxLength}`);
    const ta = h('textarea', { placeholder: cfg.placeholder, maxlength: cfg.maxLength, 'aria-label': cfg.title }) as HTMLTextAreaElement;
    ta.value = s.note;
    ta.addEventListener('input', () => {
      count.textContent = `${ta.value.length}/${cfg.maxLength}`;
      a.setNote(ta.value);
    });
    wrap.append(ta, count);
  }
  return wrap;
}

export function footer(s: State, a: Actions): HTMLElement {
  const d = s.config.drawer;
  const total = s.priced?.total ?? s.cart?.total_price ?? 0;
  const terms = d.confirmation.enabled
    ? (() => {
        const box = h('input', { type: 'checkbox' }) as HTMLInputElement;
        box.checked = s.termsAccepted;
        box.addEventListener('change', () => a.setTerms(box.checked));
        const label = h('label', { class: `ck-terms${s.termsNudge ? ' ck-shake' : ''}` }, d.confirmation.checkbox ? box : null, d.confirmation.text);
        return label;
      })()
    : null;
  const badges = d.trustBadges.enabled
    ? h('div', { class: 'ck-badges' }, ...d.trustBadges.badges.slice(0, 5).map((b) => h('div', { class: 'ck-badge', title: b }, svg(BADGES[b] ?? '', 'ck-i'))))
    : null;
  return h(
    'div',
    { class: 'ck-foot' },
    terms,
    h(
      'div',
      { class: 'ck-pay' },
      h('div', { class: 'ck-total' }, h('b', {}, money(total)), h('small', {}, 'Estimated total')),
      h('button', { class: 'ck-cta', disabled: s.busy, onclick: () => a.checkout() }, svg(icon('zap', 18, 2)), d.settings.checkoutText),
    ),
    badges,
    h('div', { class: 'ck-secured' }, svg(icon('shield', 12)), 'Secured checkout'),
  );
}

export function empty(d: DrawerSettings): HTMLElement {
  return h(
    'div',
    { class: 'ck-empty' },
    svg(icon('cart', 30, 1.5)),
    h('h3', {}, d.settings.emptyTitle),
    h('p', {}, d.settings.emptyDescription),
    h('a', { href: d.settings.emptyButtonUrl }, d.settings.emptyButtonText),
  );
}

export function couponSheet(s: State, a: Actions): HTMLElement[] {
  const d = s.config.drawer.discountCodes;
  const input = h('input', { placeholder: d.placeholder, 'aria-label': d.placeholder, autocomplete: 'off', autocapitalize: 'characters', maxlength: 40 }) as HTMLInputElement;
  const submit = () => input.value.trim() && a.applyCode(input.value);
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && submit());
  window.setTimeout(() => input.focus(), 50);
  const codes = h('div', { class: 'ck-codes' });
  for (const c of s.config.visibleCodes) {
    const on = s.codes.includes(c.code);
    codes.appendChild(
      h('button', { class: `ck-code${on ? ' ck-on' : ''}`, title: c.title ?? c.code, onclick: () => (on ? a.removeCode(c.code) : a.applyCode(c.code)) }, svg(icon(on ? 'check' : 'tag', 13)), c.code),
    );
  }
  for (const c of s.codes.filter((x) => !s.config.visibleCodes.some((v) => v.code === x))) {
    codes.appendChild(h('button', { class: 'ck-code ck-on', onclick: () => a.removeCode(c) }, svg(icon('check', 13)), c));
  }
  return [
    h('div', { class: 'ck-sheet-bg', onclick: () => a.closeSheet() }),
    h(
      'div',
      { class: 'ck-sheet', role: 'dialog', 'aria-label': 'Apply discount code' },
      h('div', { class: 'ck-grab' }),
      h('h3', {}, 'Apply Discount Code'),
      h('div', { class: 'ck-code-row' }, input, h('button', { onclick: submit }, d.applyText)),
      codes,
      s.codeMessage ? h('div', { class: `ck-msg ck-${s.codeMessage.kind}` }, s.codeMessage.text) : null,
    ),
  ];
}
