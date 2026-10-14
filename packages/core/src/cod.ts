import { percentOf, type Paise } from './money.js';
import type { AddressContext, CartLine, ShopperContext } from './types.js';

/**
 * RTO suite: rules that switch COD / partial COD off. Each rule says WHEN it matches and
 * WHAT it does. Mode 'all' = every matching rule counts, strictest wins (FlexyPe's
 * recommended); mode 'single' = only the highest-priority matching rule counts.
 */
export interface RtoOutcome {
  blockCod: boolean;
  blockPartialCod: boolean;
}

export type RtoCondition =
  /** Matches when the cart total is OUTSIDE [min, max]: COD only for orders inside the range. */
  | { kind: 'cart_amount'; min?: Paise; max?: Paise }
  /** Matches when the item count is OUTSIDE [min, max]. */
  | { kind: 'item_count'; min?: number; max?: number }
  /** Matches when the shopper's past COD orders are OUTSIDE [min, max]. */
  | { kind: 'cod_orders'; min?: number; max?: number }
  /** Matches a new (0 orders) or repeat shopper. Unknown shopper counts as new. */
  | { kind: 'customer_type'; type: 'new' | 'repeat' }
  /** Matches when past returned orders are more than max. */
  | { kind: 'returns'; max: number }
  /** Matches these verified phones. */
  | { kind: 'user'; phones: string[] }
  /** list = matches pincodes IN the list; allow_list = matches pincodes NOT in the list. */
  | { kind: 'pincode'; mode: 'list' | 'allow_list'; pincodes: string[] }
  | { kind: 'state'; mode: 'list' | 'allow_list'; states: string[] }
  /** Matches when the cart has any of these products / collections. */
  | { kind: 'product'; productIds: string[] }
  | { kind: 'collection'; collectionIds: string[] };

export interface RtoRule {
  id: string;
  active: boolean;
  priority: number;
  when: RtoCondition;
  then: RtoOutcome;
}

export interface RtoSettings {
  mode: 'all' | 'single';
  rules: RtoRule[];
}

export interface CodContext {
  total: Paise;
  lines: CartLine[];
  shopper: ShopperContext;
  address?: AddressContext;
}

const outside = (value: number, min?: number, max?: number) =>
  (min !== undefined && value < min) || (max !== undefined && value > max);

export function rtoRuleMatches(cond: RtoCondition, ctx: CodContext): boolean {
  switch (cond.kind) {
    case 'cart_amount':
      return outside(ctx.total, cond.min, cond.max);
    case 'item_count':
      return outside(ctx.lines.reduce((n, l) => n + l.quantity, 0), cond.min, cond.max);
    case 'cod_orders':
      return outside(ctx.shopper.codOrderCount ?? 0, cond.min, cond.max);
    case 'customer_type': {
      const repeat = (ctx.shopper.orderCount ?? 0) > 0;
      return cond.type === 'repeat' ? repeat : !repeat;
    }
    case 'returns':
      return (ctx.shopper.returnedOrderCount ?? 0) > cond.max;
    case 'user':
      return !!ctx.shopper.phone && cond.phones.includes(ctx.shopper.phone);
    case 'pincode': {
      const pin = ctx.address?.pincode?.trim();
      if (!pin) return false;
      const listed = cond.pincodes.includes(pin);
      return cond.mode === 'list' ? listed : !listed;
    }
    case 'state': {
      const state = ctx.address?.state?.trim().toLowerCase();
      if (!state) return false;
      const listed = cond.states.some((s) => s.trim().toLowerCase() === state);
      return cond.mode === 'list' ? listed : !listed;
    }
    case 'product':
      return ctx.lines.some((l) => cond.productIds.includes(l.productId));
    case 'collection':
      return ctx.lines.some((l) => l.collectionIds.some((c) => cond.collectionIds.includes(c)));
  }
}

export interface RtoDecision extends RtoOutcome {
  /** Ids of the rules that decided (for the dashboard and "why is COD unavailable"). */
  matchedRuleIds: string[];
}

export function decideRto(settings: RtoSettings | undefined, ctx: CodContext): RtoDecision {
  const decision: RtoDecision = { blockCod: false, blockPartialCod: false, matchedRuleIds: [] };
  if (!settings) return decision;
  const matching = settings.rules
    .filter((r) => r.active && rtoRuleMatches(r.when, ctx))
    .sort((a, b) => b.priority - a.priority);
  const counted = settings.mode === 'single' ? matching.slice(0, 1) : matching;
  for (const rule of counted) {
    decision.blockCod ||= rule.then.blockCod;
    decision.blockPartialCod ||= rule.then.blockPartialCod;
    decision.matchedRuleIds.push(rule.id);
  }
  return decision;
}

/** Partial COD: the merchant sets the advance as a fixed amount or a percent (owner 2026-10-14). */
export interface PartialCodSettings {
  enabled: boolean;
  advance: { type: 'fixed'; amount: Paise } | { type: 'percent'; percent: number };
  minAdvance?: Paise;
  maxAdvance?: Paise;
}

export interface CodSettings {
  codEnabled: boolean;
  /** Extra charge for full COD (0 = none). */
  codFee: Paise;
  partial?: PartialCodSettings;
}

export function partialCodSplit(total: Paise, settings: PartialCodSettings): { payNow: Paise; payOnDelivery: Paise } {
  let payNow = settings.advance.type === 'fixed' ? settings.advance.amount : percentOf(total, settings.advance.percent);
  if (settings.minAdvance !== undefined) payNow = Math.max(payNow, settings.minAdvance);
  if (settings.maxAdvance !== undefined) payNow = Math.min(payNow, settings.maxAdvance);
  payNow = Math.min(Math.max(payNow, 0), total);
  return { payNow, payOnDelivery: total - payNow };
}
