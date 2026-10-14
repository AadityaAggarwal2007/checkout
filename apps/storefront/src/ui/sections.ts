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
  setCodeDraft(code: string): void;
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
    h('div', { class: 'ck-head-row' }, h('button', { class: 'ck-x', 'aria-label': 'Close cart', onclick: () => a.close() }, svg(icon('chevronLeft', 24, 2))), h('h2', {}, `Shopping Bag${n ? ` (${n})` : ''}`)),
    timer(s),
  );
}

/** "Hurry! 03Min : 58Sec": counts down from when this tab first opened the bag, then starts again. */
function timer(s: State): HTMLElement | null {
  const t = s.config.drawer.timer;
  if (!t.enabled) return null;
  const total = t.minutes * 60;
  const startedAt = timerStart();
  const min = h('b', {});
  const sec = h('b', {});
  const paint = () => {
    const left = total - (Math.floor((Date.now() - startedAt) / 1000) % total);
    min.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}Min`;
    sec.textContent = `${String(left % 60).padStart(2, '0')}Sec`;
  };
  paint();
  const el = h('div', { class: 'ck-timer', role: 'timer' }, h('span', {}, t.text), min, h('span', {}, ':'), sec);
  const id = window.setInterval(() => (el.isConnected ? paint() : window.clearInterval(id)), 1000);
  return el;
}

function timerStart(): number {
  try {
    const saved = Number(sessionStorage.getItem('ck:timer'));
    if (saved > 0) return saved;
    sessionStorage.setItem('ck:timer', String(Date.now()));
  } catch {
    /* storage blocked: the timer starts with this page */
  }
  return (timerStart as { at?: number }).at ??= Date.now();
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

/**
 * What the milestones count: the same amount free-gift and other coupons check their "minimum purchase"
 * against (selling prices before offers), so the bar never says "₹7 away" while the gift is already in.
 */
export function rewardAmount(s: State): number {
  return s.priced?.subtotal ?? s.cart?.total_price ?? 0;
}

const TIER_ICON: Record<string, string> = { shipping: '🚚', gift: '🎁', discount: '🏷️' };

export function rewardBar(cfg: DrawerSettings['rewardBar'], s: State): HTMLElement | null {
  if (!cfg.enabled || cfg.tiers.length === 0 || !s.cart) return null;
  const value = cfg.counting === 'value';
  const current = value ? rewardAmount(s) : s.cart.item_count;
  const sorted = [...cfg.tiers].sort((x, y) => x.threshold - y.threshold);
  const p = rewardProgress(sorted, current);
  const title = p.allReached
    ? h('span', {}, 'Congrats! You have unlocked best discounts')
    : value
      ? h('span', {}, 'You are ', h('b', {}, money(p.remaining)), ' away to unlock next milestone')
      : h('span', {}, 'Add ', h('b', {}, `${p.remaining} more item${p.remaining === 1 ? '' : 's'}`), ' to unlock next milestone');
  // Milestones sit at even steps after the flag; the fill advances segment by segment.
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
  const track = h('div', { class: 'ck-track' }, h('span', { class: 'ck-flag' }, '⛳'), h('div', { class: 'ck-fill', style: `width:${Math.max(0, Math.min(100, fill))}%` }));
  sorted.forEach((t, i) => {
    const on = current >= t.threshold;
    track.appendChild(
      h(
        'div',
        { class: `ck-dot${on ? ' ck-on' : ''}`, style: `left:${((i + 1) / n) * 100}%` },
        h('span', { class: 'ck-dot-v' }, value ? String(Math.round(t.threshold / 100)) : String(t.threshold)),
        h('span', { class: 'ck-dot-i', 'aria-hidden': 'true' }, TIER_ICON[t.kind] ?? '🎁'),
        h('span', { class: 'ck-dot-l' }, t.label),
      ),
    );
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

  const prices = h('div', { class: 'ck-prices' }, allFree ? h('span', { class: 'ck-now' }, money(0)) : h('span', { class: 'ck-now' }, money(total)));
  if (wasTotal && wasTotal > total) prices.appendChild(h('span', { class: 'ck-was' }, money(wasTotal)));
  const off = wasTotal && wasTotal > total && st.showSavings ? pct(wasTotal - total, wasTotal) : 0;

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
  if (off > 0) img.appendChild(h('span', { class: 'ck-offb' }, `${off}%`, h('br', {}), 'OFF'));

  return h(
    'div',
    { class: 'ck-line' },
    img,
    h(
      'div',
      { class: 'ck-l-main' },
      h('div', { class: 'ck-l-top' }, h('div', { class: 'ck-l-name' }, h('div', { class: 'ck-l-title' }, item.product_title), variantControl, ...props), prices),
      h(
        'div',
        { class: 'ck-l-bottom' },
        h('button', { class: 'ck-del', 'aria-label': `Remove ${item.product_title}`, onclick: () => a.setQuantity(item.key, 0) }, svg(icon('trash', 16))),
        h(
          'div',
          { class: 'ck-step' },
          h('button', { 'aria-label': 'Decrease', onclick: () => a.setQuantity(item.key, item.quantity - 1) }, svg(icon('minus', 14, 2))),
          h('span', { 'aria-live': 'polite' }, item.quantity),
          h('button', { 'aria-label': 'Increase', onclick: () => a.setQuantity(item.key, item.quantity + 1) }, svg(icon('plus', 14, 2))),
        ),
      ),
    ),
  );
}

/** The bag: free gifts first (gold card), then each item as its own card; offer groups keep their label. */
export function orderSummary(s: State, a: Actions): HTMLElement {
  const list = h('div', { class: 'ck-items' });
  for (const g of s.priced?.gifts ?? []) {
    const img = h('div', { class: 'ck-img' });
    if (g.image) img.style.backgroundImage = cssUrl(g.image);
    list.appendChild(
      h(
        'div',
        { class: 'ck-line ck-gift' },
        img,
        h(
          'div',
          { class: 'ck-l-main' },
          h(
            'div',
            { class: 'ck-l-top' },
            h('div', { class: 'ck-l-name' }, h('div', { class: 'ck-l-title' }, g.title), h('span', { class: 'ck-chip' }, '🎁 Free Gift')),
            h('div', { class: 'ck-prices' }, h('span', { class: 'ck-now' }, money(0)), h('span', { class: 'ck-was' }, money(g.unitPrice * g.quantity))),
          ),
        ),
        h('span', { class: 'ck-bow', 'aria-hidden': 'true' }, '🎀'),
      ),
    );
  }
  const pricedByKey = new Map((s.priced?.lines ?? []).map((l) => [l.lineId, l]));
  const groups = s.priced?.groups ?? {};
  const shownGroups = new Map<string, HTMLElement>();
  for (const item of s.cart?.items ?? []) {
    const priced = pricedByKey.get(item.key);
    const view = lineView(item, priced, s, a);
    const gid = priced?.groupIds.find((g) => groups[g]);
    if (!gid) {
      list.appendChild(view);
      continue;
    }
    let box = shownGroups.get(groups[gid]!);
    if (!box) {
      box = h('div', { class: 'ck-group' }, h('div', { class: 'ck-group-h' }, svg(icon('checkCircle', 15)), groups[gid]!));
      shownGroups.set(groups[gid]!, box);
      list.appendChild(box);
    }
    box.appendChild(view);
  }
  return list;
}

/** "Enter coupon code" + Apply right in the bag; the store's listed coupons open in a sheet. */
export function coupons(s: State, a: Actions): HTMLElement | null {
  const d = s.config.drawer.discountCodes;
  if (!d.enabled) return null;
  const input = h('input', { placeholder: d.placeholder, 'aria-label': d.placeholder, autocomplete: 'off', autocapitalize: 'characters', maxlength: 40 }) as HTMLInputElement;
  input.value = s.codeDraft;
  input.addEventListener('input', () => a.setCodeDraft(input.value));
  const submit = () => input.value.trim() && a.applyCode(input.value);
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && submit());
  return h(
    'div',
    { class: 'ck-coupon' },
    h('div', { class: 'ck-code-row' }, input, h('button', { onclick: submit, disabled: s.busy }, d.applyText)),
    s.codes.length
      ? h('div', { class: 'ck-codes' }, ...s.codes.map((c) => h('button', { class: 'ck-code ck-on', 'aria-label': `Remove ${c}`, onclick: () => a.removeCode(c) }, svg(icon('check', 13)), c, h('span', { class: 'ck-code-x' }, '×'))))
      : null,
    s.codeMessage && !s.sheet ? h('div', { class: `ck-msg ck-${s.codeMessage.kind}` }, s.codeMessage.text) : null,
    s.config.visibleCodes.length ? h('button', { class: 'ck-coupon-btn', onclick: () => a.openCoupons() }, 'View all coupons', svg(icon('chevronRight', 16))) : null,
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
            h('button', { class: 'ck-btn-o', disabled: s.busy, onclick: () => a.addUpsell(p.variantId) }, '+ Add'),
          ),
        ),
      ),
    );
  }
  return h('div', { class: 'ck-card ck-upsell' }, h('div', { class: 'ck-ups-h' }, cfg.title), row);
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

/** What the bag would cost without any offer: compare-at prices and the free gifts' prices. */
export function fullPrice(s: State): number {
  const priced = new Map((s.priced?.lines ?? []).map((l) => [l.lineId, l]));
  let was = 0;
  for (const i of s.cart?.items ?? []) {
    const p = priced.get(i.key);
    const unit = Math.max(p?.compareAtPrice ?? 0, p?.unitPrice ?? i.price, i.original_price);
    was += unit * i.quantity;
  }
  for (const g of s.priced?.gifts ?? []) was += g.unitPrice * g.quantity;
  return was;
}

export function footer(s: State, a: Actions): HTMLElement {
  const d = s.config.drawer;
  const total = s.priced?.total ?? s.cart?.total_price ?? 0;
  const was = fullPrice(s);
  const saving = Math.max(0, was - total);
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
    saving > 0 ? h('div', { class: 'ck-saving' }, '🎉 You\'re saving ', h('b', {}, money(saving)), ' 🎉!') : null,
    h(
      'div',
      { class: 'ck-foot-in' },
      terms,
      h(
        'div',
        { class: 'ck-pay' },
        h('div', { class: 'ck-total' }, h('small', {}, 'Estimated Total'), h('div', {}, was > total ? h('s', {}, money(was)) : null, h('b', {}, money(total)))),
        h(
          'button',
          { class: 'ck-cta', disabled: s.busy, onclick: () => a.checkout() },
          d.settings.buttonTag ? h('span', { class: 'ck-cta-tag' }, d.settings.buttonTag) : null,
          h('span', { class: 'ck-cta-main' }, d.settings.checkoutText, h('span', { class: 'ck-cta-apps' }, ...['gpay', 'phonepe', 'paytm'].map((b) => svg(BADGES[b] ?? '', 'ck-app')))),
          h('span', { class: 'ck-cta-sub' }, svg(icon('shield', 10)), '100% secure payments'),
        ),
      ),
      badges,
    ),
  );
}

/** Three dots while the bag is being updated. */
export function loader(): HTMLElement {
  return h('div', { class: 'ck-loader', role: 'status', 'aria-label': 'Updating your bag' }, h('i', {}), h('i', {}), h('i', {}));
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
  const cards = h('div', { class: 'ck-cards' });
  for (const c of s.config.visibleCodes) {
    const on = s.codes.includes(c.code);
    // A card like the checkout's: title, one line of conditions, the code, Apply / Remove.
    cards.appendChild(
      h(
        'div',
        { class: `ck-card${on ? ' ck-on' : ''}` },
        h(
          'div',
          { class: 'ck-card-text' },
          h('b', {}, c.title ?? c.code),
          c.details?.[0] ? h('span', {}, c.details[0]) : null,
          h('span', { class: 'ck-code' }, svg(icon(on ? 'check' : 'tag', 12)), c.code),
        ),
        h('button', { class: 'ck-card-btn', onclick: () => (on ? a.removeCode(c.code) : a.applyCode(c.code)) }, on ? 'Remove' : 'Apply'),
      ),
    );
  }
  return [
    h('div', { class: 'ck-sheet-bg', onclick: () => a.closeSheet() }),
    h(
      'div',
      { class: 'ck-sheet', role: 'dialog', 'aria-label': 'Coupons' },
      h('div', { class: 'ck-grab' }),
      h('h3', {}, 'Coupons for you'),
      cards,
      s.codeMessage ? h('div', { class: `ck-msg ck-${s.codeMessage.kind}` }, s.codeMessage.text) : null,
    ),
  ];
}
