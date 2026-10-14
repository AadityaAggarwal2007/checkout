import type { StorefrontConfig } from '@checkout/shared';
import type { ServerApi } from './api.js';
import { confetti } from './confetti.js';
import { h } from './dom.js';
import { cartApi, type ShopifyCart } from './shopify-cart.js';
import { codeStorage, Store, type State } from './state.js';
import { css } from './styles.js';
import * as ui from './ui/sections.js';

export interface DrawerOptions {
  config: StorefrontConfig;
  api: ServerApi;
  storeKey: string;
  /** Dashboard preview: no overlay, always open, no Shopify calls. */
  preview?: boolean;
  /** Called when the cart count changes (to update the theme's own badge). */
  onCount?: (count: number) => void;
  /** Popup mode: open our checkout for these lines (index.ts owns the iframe). */
  onCheckout?: (lines: Array<{ variantId: string; quantity: number }>, codes: string[], note: string) => void;
  /** Preview only: the cart to show instead of the store's. */
  sampleCart?: ShopifyCart;
}

/**
 * The cart drawer. Renders from one State; every action updates the Shopify cart, then reprices
 * on our server (prices from the catalog + coupons), then re-renders.
 */
export class Drawer {
  readonly store: Store;
  private readonly root: ShadowRoot;
  private readonly host: HTMLElement;
  private readonly styleEl: HTMLStyleElement;
  private pricingSeq = 0;
  private noteTimer = 0;
  private lastFocus: Element | null = null;

  constructor(private readonly opts: DrawerOptions) {
    this.host = h('div', { id: 'ck-cart-drawer' });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.styleEl = document.createElement('style');
    this.root.appendChild(this.styleEl);
    document.body.appendChild(this.host);
    this.store = new Store({
      config: opts.config,
      cart: null,
      priced: null,
      codes: codeStorage.read(opts.storeKey),
      open: !!opts.preview,
      busy: false,
      upsells: [],
      sheet: null,
      codeMessage: null,
      codeDraft: '',
      noteOpen: false,
      note: '',
      termsAccepted: false,
      termsNudge: 0,
      products: new Map(),
      celebrated: new Set(),
    });
    this.store.subscribe(() => this.render());
    if (opts.preview) void this.refresh();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.store.state.open) this.store.state.sheet ? this.actions.closeSheet() : this.close();
    });
    this.render();
  }

  setConfig(config: StorefrontConfig): void {
    this.store.set({ config });
  }

  /** Load the Shopify cart and price it. */
  async refresh(cart?: ShopifyCart): Promise<void> {
    if (this.opts.preview) {
      this.store.set({ cart: this.opts.sampleCart ?? null });
      return;
    }
    const next = cart ?? (await cartApi.get());
    this.store.set({ cart: next, note: this.store.state.noteOpen ? this.store.state.note : next.note ?? '' });
    this.opts.onCount?.(next.item_count);
    await this.reprice();
  }

  async reprice(): Promise<void> {
    const { cart, codes } = this.store.state;
    if (!cart || cart.items.length === 0) return this.store.set({ priced: null });
    const seq = ++this.pricingSeq;
    try {
      const priced = await this.opts.api.price(
        cart.items.map((i) => ({ lineId: i.key, variantId: String(i.id), quantity: i.quantity })),
        codes,
      );
      if (seq !== this.pricingSeq) return; // a newer cart change won
      const before = new Set((this.store.state.priced?.gifts ?? []).map((g) => g.variantId));
      const newGift = !!this.store.state.priced && priced.gifts.some((g) => !before.has(g.variantId));
      this.store.set({ priced });
      if (newGift && this.store.state.open) this.rain();
      else this.celebrate();
    } catch {
      // Server unreachable: keep showing Shopify's own numbers.
      if (seq === this.pricingSeq) this.store.set({ priced: null });
    }
  }

  open(): void {
    if (this.store.state.open) return;
    this.lastFocus = document.activeElement;
    document.documentElement.style.overflow = 'hidden';
    this.store.set({ open: true });
    if (!this.opts.preview && this.store.state.upsells.length === 0 && this.store.state.config.drawer.upsells.enabled) {
      void this.opts.api.upsells().then((upsells) => this.store.set({ upsells }));
    }
    void this.refresh().catch(() => undefined);
    window.setTimeout(() => (this.root.querySelector('.ck-x') as HTMLElement | null)?.focus(), 60);
  }

  close(): void {
    if (this.opts.preview) return;
    document.documentElement.style.overflow = '';
    this.store.set({ open: false, sheet: null });
    (this.lastFocus as HTMLElement | null)?.focus?.();
  }

  private async mutate(work: () => Promise<unknown>): Promise<void> {
    this.store.set({ busy: true });
    try {
      const result = await work();
      await this.refresh(isCart(result) ? result : undefined);
    } catch (err) {
      this.store.set({ codeMessage: { kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong.' } });
    } finally {
      this.store.set({ busy: false });
    }
  }

  private celebrate(): void {
    const s = this.store.state;
    const d = s.config.drawer;
    if (!d.rewardBar.enabled || !d.rewardBar.confetti || !s.cart) return;
    const current = d.rewardBar.counting === 'value' ? ui.rewardAmount(s) : s.cart.item_count;
    const fresh = d.rewardBar.tiers.filter((t) => current >= t.threshold && !s.celebrated.has(t.id));
    if (fresh.length === 0) return;
    const celebrated = new Set(s.celebrated);
    fresh.forEach((t) => celebrated.add(t.id));
    s.celebrated = celebrated; // no re-render needed
    if (s.open) this.rain();
  }

  /** Confetti over the bag only. */
  private rain(): void {
    const panel = this.root.querySelector('.ck-panel') as HTMLElement | null;
    confetti(this.root, panel?.getBoundingClientRect());
  }

  readonly actions: ui.Actions = {
    close: () => this.close(),
    setQuantity: (key, quantity) => void this.mutate(() => cartApi.change(key, Math.max(0, quantity))),
    changeVariant: (item, variantId) =>
      void this.mutate(async () => {
        await cartApi.add(variantId, item.quantity, item.properties ?? undefined);
        return cartApi.change(item.key, 0);
      }),
    loadVariants: (handle) => {
      if (this.store.state.products.has(handle) || this.opts.preview) return;
      this.store.state.products.set(handle, { id: 0, handle, title: '', variants: [] }); // in flight
      void cartApi.product(handle).then(
        (p) => this.store.set({ products: new Map(this.store.state.products).set(handle, p) }),
        () => undefined,
      );
    },
    addUpsell: (variantId) => void this.mutate(() => cartApi.add(variantId, 1)),
    openCoupons: () => this.store.set({ sheet: 'coupons', codeMessage: null }),
    closeSheet: () => this.store.set({ sheet: null }),
    setCodeDraft: (code) => {
      this.store.state.codeDraft = code; // no re-render while typing
    },
    applyCode: (raw) => {
      const code = raw.trim().toUpperCase();
      if (!code) return;
      const codes = [...new Set([...this.store.state.codes, code])].slice(-5);
      this.store.set({ codes, codeMessage: null, busy: true });
      void this.reprice().then(() => {
        const s = this.store.state;
        const rejected = s.priced?.rejected.find((r) => r.code === code);
        if (rejected) {
          this.store.set({ busy: false, codes: s.codes.filter((c) => c !== code), codeMessage: { kind: 'err', text: rejected.message } });
          void this.reprice();
        } else {
          codeStorage.write(this.opts.storeKey, s.codes);
          this.store.set({ busy: false, sheet: null, codeDraft: '', codeMessage: { kind: 'ok', text: s.config.drawer.discountCodes.appliedMessage } });
          if (s.config.drawer.discountCodes.confetti) this.rain();
        }
      });
    },
    removeCode: (code) => {
      const codes = this.store.state.codes.filter((c) => c !== code);
      codeStorage.write(this.opts.storeKey, codes);
      this.store.set({ codes, codeMessage: null });
      void this.reprice();
    },
    toggleNote: () => this.store.set({ noteOpen: !this.store.state.noteOpen }),
    setNote: (note) => {
      this.store.state.note = note; // no re-render while typing
      window.clearTimeout(this.noteTimer);
      if (!this.opts.preview) this.noteTimer = window.setTimeout(() => void cartApi.note(note).catch(() => undefined), 600);
    },
    setTerms: (accepted) => this.store.set({ termsAccepted: accepted }),
    checkout: () => {
      const s = this.store.state;
      const c = s.config.drawer.confirmation;
      if (c.enabled && c.checkbox && c.required && !s.termsAccepted) {
        this.store.set({ termsNudge: s.termsNudge + 1 });
        return;
      }
      if (this.opts.preview) return;
      if (s.config.checkout.mode === 'popup' && this.opts.onCheckout && s.cart) {
        const lines = s.cart.items.map((i) => ({ variantId: String(i.id), quantity: i.quantity }));
        this.opts.onCheckout(lines, s.codes, s.note);
        return;
      }
      const code = s.codes[0];
      window.location.href = code ? `/discount/${encodeURIComponent(code)}?redirect=/checkout` : '/checkout';
    },
  };

  private render(): void {
    const s = this.store.state;
    const d = s.config.drawer;
    this.styleEl.textContent = css(d.colors);
    const scroll = (this.root.querySelector('.ck-body') as HTMLElement | null)?.scrollTop ?? 0;
    for (const el of [...this.root.children]) if (el !== this.styleEl) el.remove();
    if (!s.open && !this.opts.preview && !s.cart) return; // nothing rendered until first open

    const hasItems = (s.cart?.items.length ?? 0) > 0;
    const panel = h('div', { class: 'ck-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Shopping cart' }, ui.header(s, this.actions), ui.announcements(d.announcements));
    if (hasItems) {
      const body = h(
        'div',
        { class: 'ck-body' },
        ui.rewardBar(d.rewardBar, s),
        ui.orderSummary(s, this.actions),
        ui.coupons(s, this.actions),
        ui.upsells(d.upsells, s.upsells, s, this.actions),
        ui.notes(d.notes, s, this.actions),
      );
      panel.append(body, ui.footer(s, this.actions));
      if (s.busy) panel.append(ui.loader());
      if (s.sheet === 'coupons') panel.append(...ui.couponSheet(s, this.actions));
      requestAnimationFrame(() => (body.scrollTop = scroll));
    } else {
      panel.appendChild(ui.empty(d));
    }
    const wrap = h(
      'div',
      { class: `ck${s.open ? ' ck-open' : ''}${this.opts.preview ? ' ck-preview' : ''}` },
      this.opts.preview ? null : h('div', { class: 'ck-overlay', onclick: () => this.close() }),
      panel,
    );
    this.root.appendChild(wrap);
  }
}

function isCart(x: unknown): x is ShopifyCart {
  return !!x && typeof x === 'object' && Array.isArray((x as ShopifyCart).items) && 'item_count' in (x as object);
}
