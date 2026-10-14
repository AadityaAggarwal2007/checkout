import type { Cart, ShopperContext } from '@checkout/core';
import { upsellRuleSchema, type CheckoutUpsell, type UpsellRuleData } from '@checkout/shared';
import type { CatalogProduct } from '../catalog/types.js';

/** Stored on CheckoutSession.upsell. */
export interface UpsellState {
  /** ruleId -> epoch ms the offer was first shown (its timer starts then). */
  shown: Record<string, number>;
  /** lineId -> the offer it came from and the % off locked when it was added. */
  lines: Record<string, { ruleId: string; percent: number }>;
}

export interface LiveRule {
  id: string;
  priority: number;
  rule: UpsellRuleData;
}

export const UPSELL_PREFIX = 'up-';
export const upsellStateOf = (json: unknown): UpsellState => {
  const s = (json ?? {}) as Partial<UpsellState>;
  return { shown: s.shown ?? {}, lines: s.lines ?? {} };
};

/** Rules from the database; a row that does not parse any more is skipped, never shown half. */
export function liveRules(rows: Array<{ id: string; priority: number; rule: unknown }>): LiveRule[] {
  return rows
    .map((r) => {
      const p = upsellRuleSchema.safeParse(r.rule);
      return p.success ? { id: r.id, priority: r.priority, rule: p.data } : null;
    })
    .filter((r): r is LiveRule => !!r)
    .sort((a, b) => b.priority - a.priority);
}

export const offerPrice = (price: number, percent: number) => Math.round((price * (100 - percent)) / 100);

/** Does the rule apply to this cart and shopper (ignoring the timer)? */
export function ruleMatches(r: UpsellRuleData, cart: Cart, shopper: ShopperContext): boolean {
  const repeat = (shopper.orderCount ?? 0) > 0;
  if (r.audience === 'new' && repeat) return false;
  if (r.audience === 'repeat' && !repeat) return false;
  const lines = cart.lines.filter((l) => !l.lineId.startsWith(UPSELL_PREFIX));
  if (r.when.kind === 'products') {
    const ids = r.when.productIds;
    return lines.some((l) => ids.includes(l.productId));
  }
  if (r.when.kind === 'collections') {
    const ids = r.when.collectionIds;
    return lines.some((l) => l.collectionIds.some((c) => ids.includes(c)));
  }
  return lines.length > 0;
}

/** The first rule (highest priority) that matches and whose timer has not run out. */
export function pickRule(rules: LiveRule[], cart: Cart, shopper: ShopperContext, state: UpsellState, now: number): LiveRule | null {
  for (const r of rules) {
    if (!ruleMatches(r.rule, cart, shopper)) continue;
    const shown = state.shown[r.id];
    if (r.rule.timerMinutes && shown !== undefined && now > shown + r.rule.timerMinutes * 60_000) continue;
    return r;
  }
  return null;
}

/** What the checkout shows for this rule: its products not already in the cart, in stock, with server prices. */
export function offerOf(r: LiveRule, products: CatalogProduct[], cart: Cart, shownAt: number | undefined): CheckoutUpsell | null {
  const inCart = new Set(cart.lines.map((l) => l.productId));
  const items = r.rule.productIds
    .map((id) => products.find((p) => p.productId === id))
    .filter((p): p is CatalogProduct => !!p && !inCart.has(p.productId))
    .map((p) => ({
      productId: p.productId,
      title: p.title,
      image: p.image ?? p.variants[0]?.image,
      variants: p.variants
        .filter((v) => v.available)
        .map((v) => ({ variantId: v.variantId, title: v.title && v.title !== 'Default Title' ? v.title : undefined, price: v.price, offerPrice: offerPrice(v.price, r.rule.discountPercent) })),
    }))
    .filter((p) => p.variants.length > 0)
    .slice(0, r.rule.maxItems);
  if (items.length === 0) return null;
  return {
    ruleId: r.id,
    title: r.rule.title,
    percent: r.rule.discountPercent,
    endsAt: r.rule.timerMinutes && shownAt !== undefined ? shownAt + r.rule.timerMinutes * 60_000 : undefined,
    items,
  };
}

/**
 * Lines added from an offer get the % off locked when they were added (the catalog price is re-read;
 * only the % is kept). The original price stays as "compare at" so the shopper sees the saving.
 */
export function withUpsellPrices(cart: Cart, state: UpsellState): Cart {
  return {
    ...cart,
    lines: cart.lines.map((l) => {
      const u = state.lines[l.lineId];
      if (!u || !u.percent) return l;
      return { ...l, unitPrice: offerPrice(l.unitPrice, u.percent), compareAtPrice: Math.max(l.compareAtPrice ?? 0, l.unitPrice) };
    }),
  };
}
