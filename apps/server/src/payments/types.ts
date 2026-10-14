import type { Paise } from '@checkout/core';

/** What we ask a gateway to collect. Amounts are paise; adapters format them for the gateway. */
export interface PaymentRequest {
  /** Our unique reference (PaymentTransaction.merchantRef, at most 25 characters). */
  merchantRef: string;
  amount: Paise;
  /** Online method the shopper chose in our checkout (a hint; the gateway page may still offer others). */
  method?: string;
  customer: { name: string; phone: string; email?: string };
  /** Where the gateway sends the shopper back (GET or POST). */
  returnUrl: string;
  /** Webhook / server-to-server notification URL, where the gateway supports one per payment. */
  notifyUrl: string;
  description: string;
}

/** How to send the shopper to the gateway. */
export type GatewayStart =
  | { kind: 'redirect'; url: string; gatewayRef?: string }
  | { kind: 'post'; url: string; fields: Record<string, string>; gatewayRef?: string };

export interface GatewayStatus {
  state: 'success' | 'failed' | 'pending';
  /** Amount the gateway says was collected, paise (when it says). */
  amount?: Paise;
  gatewayRef?: string;
  method?: string;
  /** The gateway's answer with nothing secret in it (kept for support). */
  raw: unknown;
}

/**
 * One payment gateway. Rule 3: an order is "paid" only after status() — a server-to-server
 * call — says success for the right amount. Callbacks and redirects only tell us WHICH
 * payment to check (refFromCallback); their content is never trusted.
 */
export interface Gateway {
  start(req: PaymentRequest): Promise<GatewayStart>;
  status(merchantRef: string, gatewayRef: string | null): Promise<GatewayStatus>;
  refFromCallback(body: Record<string, unknown>, query: Record<string, unknown>): string | null;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const rupees = (paise: Paise): string => (paise / 100).toFixed(2);

/** "123.45" / 123.45 -> 12345 paise; null when it is not a sane amount. */
export function paiseFrom(value: unknown): Paise | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}
