import type { PriceResponse, StorefrontConfig } from '@checkout/shared';
import type { UpsellProduct } from './api.js';
import type { ShopifyCart, ShopifyProductJson } from './shopify-cart.js';

export interface State {
  config: StorefrontConfig;
  cart: ShopifyCart | null;
  priced: PriceResponse | null;
  codes: string[];
  open: boolean;
  /** A cart call is running (lines show a light "busy" state). */
  busy: boolean;
  upsells: UpsellProduct[];
  sheet: 'coupons' | null;
  codeMessage: { kind: 'ok' | 'err'; text: string } | null;
  noteOpen: boolean;
  note: string;
  termsAccepted: boolean;
  termsNudge: number;
  products: Map<string, ShopifyProductJson>;
  /** Reward tiers already celebrated (confetti once per tier). */
  celebrated: Set<string>;
}

type Listener = (s: State) => void;

/** Minimal observable state: set() merges and notifies; the drawer re-renders from it. */
export class Store {
  private listeners: Listener[] = [];
  constructor(public state: State) {}

  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  subscribe(l: Listener): void {
    this.listeners.push(l);
  }
}

/** Codes survive a page reload (per tab, per store). Storage may be blocked: never throw. */
export const codeStorage = {
  read(key: string): string[] {
    try {
      const raw = sessionStorage.getItem(`ck:codes:${key}`);
      return raw ? (JSON.parse(raw) as string[]).filter((c) => typeof c === 'string').slice(0, 5) : [];
    } catch {
      return [];
    }
  },
  write(key: string, codes: string[]): void {
    try {
      sessionStorage.setItem(`ck:codes:${key}`, JSON.stringify(codes));
    } catch {
      /* private mode / blocked storage */
    }
  },
};
