import { randomUUID } from 'node:crypto';
import type { FetchLike, Gateway, GatewayStart, GatewayStatus, PaymentRequest, UpiIntentRequest, UpiIntentStart } from './types.js';
import { upiIntentIn } from './payu.js';

export interface PineLabsCredentials {
  /** Merchant ID (MID) from the Pine Labs Online dashboard (Settings > Credentials). */
  mid: string;
  clientId: string;
  clientSecret: string;
}

const BASE = { test: 'https://pluraluat.v2.pinepg.in/api', live: 'https://api.pluralpay.in/api' } as const;

/** Our method -> Pine Labs' allowed_payment_methods, so the hosted page offers only what the shopper chose. */
const METHODS: Record<string, string[]> = {
  upi: ['UPI'],
  card: ['CARD'],
  netbanking: ['NETBANKING'],
  wallet: ['WALLET'],
  emi: ['CREDIT_EMI', 'DEBIT_EMI'],
};

const SUCCESS = new Set(['PROCESSED']);
const FAILED = new Set(['FAILED', 'CANCELLED']);

/** Bearer tokens per client id and mode, kept until shortly before they expire (one call per ~hour, not per payment). */
const tokens = new Map<string, { token: string; until: number }>();

/**
 * Pine Labs Online (Plural) v3 APIs, as in Pine Labs' own WooCommerce plugin and MCP connector:
 * OAuth client-credentials token, hosted checkout (`/checkout/v1/orders` -> redirect_url), UPI intent server to
 * server (`/pay/v1/orders` then `/pay/v1/orders/{id}/payments` with txn_mode INTENT -> challenge_url upi://pay),
 * and the order status (`GET /pay/v1/orders/{id}`, PROCESSED = paid). Rule 3 holds: only status() decides.
 */
export class PineLabsGateway implements Gateway {
  private readonly base: string;

  constructor(
    private readonly creds: PineLabsCredentials,
    private readonly mode: 'test' | 'live',
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.base = BASE[mode];
  }

  private async token(): Promise<string> {
    const key = `${this.mode}:${this.creds.clientId}`;
    const cached = tokens.get(key);
    if (cached && cached.until > Date.now()) return cached.token;
    const res = await this.fetchImpl(`${this.base}/auth/v1/token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: this.creds.clientId, client_secret: this.creds.clientSecret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_at?: string; message?: string };
    if (!res.ok || !data.access_token) throw new Error(`Pine Labs token failed (${res.status}): ${data.message ?? 'no access_token'}`);
    const expires = data.expires_at ? Date.parse(data.expires_at) : NaN;
    tokens.set(key, { token: data.access_token, until: (Number.isFinite(expires) ? expires : Date.now() + 30 * 60_000) - 60_000 });
    if (tokens.size > 100) tokens.clear();
    return data.access_token;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; json: T }> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'merchant-id': this.creds.mid,
        'request-id': randomUUID(),
        'request-timestamp': new Date().toISOString(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as T };
  }

  private orderBody(req: PaymentRequest, methods?: string[]) {
    const [first, ...rest] = req.customer.name.trim().split(/\s+/);
    return {
      merchant_order_reference: req.merchantRef,
      order_amount: { value: req.amount, currency: 'INR' },
      pre_auth: false,
      callback_url: req.returnUrl,
      failure_callback_url: req.returnUrl,
      ...(methods ? { allowed_payment_methods: methods } : {}),
      purchase_details: {
        customer: {
          first_name: first || 'Customer',
          last_name: rest.join(' ') || undefined,
          email_id: req.customer.email || undefined,
          mobile_number: req.customer.phone.replace(/\D/g, '').slice(-10),
          country_code: '91',
        },
      },
    };
  }

  /** Hosted checkout page for this payment (cards, net banking, wallets; UPI when the in-page QR is not used). */
  async start(req: PaymentRequest): Promise<GatewayStart> {
    const { ok, status, json } = await this.call<{ order_id?: string; redirect_url?: string; message?: string; response_message?: string }>(
      'POST',
      '/checkout/v1/orders',
      { ...this.orderBody(req, req.method ? METHODS[req.method] : undefined), integration_mode: 'REDIRECT' },
    );
    if (!ok || !json.redirect_url) throw new Error(`Pine Labs checkout failed (${status}): ${json.message ?? json.response_message ?? JSON.stringify(json).slice(0, 300)}`);
    return { kind: 'redirect', url: json.redirect_url, gatewayRef: json.order_id };
  }

  /** UPI QR / app buttons in our page: a pay order, then a UPI INTENT payment whose challenge_url is the upi:// link. */
  async startUpiIntent(req: UpiIntentRequest): Promise<UpiIntentStart | null> {
    const refuse = (why: string): null => {
      console.warn(`[pinelabs upi-intent] ${req.merchantRef}: ${why}`);
      return null;
    };
    try {
      const order = await this.call<{ data?: { order_id?: string }; message?: string }>('POST', '/pay/v1/orders', this.orderBody(req, ['UPI']), 8_000);
      const orderId = order.json.data?.order_id;
      if (!order.ok || !orderId) return refuse(`order ${order.status}: ${order.json.message ?? 'no order_id'}`);
      const payment = await this.call<{ data?: unknown; message?: string }>(
        'POST',
        `/pay/v1/orders/${encodeURIComponent(orderId)}/payments`,
        {
          payments: [
            {
              merchant_payment_reference: `${req.merchantRef}u`,
              payment_method: 'UPI',
              payment_amount: { value: req.amount, currency: 'INR' },
              payment_option: { upi_details: { txn_mode: 'INTENT' } },
            },
          ],
        },
        8_000,
      );
      if (!payment.ok) return refuse(`payment ${payment.status}: ${payment.json.message ?? JSON.stringify(payment.json).slice(0, 300)}`);
      const intent = upiIntentIn(payment.json, req.amount);
      if (!intent) return refuse(`no upi:// link for our amount: ${JSON.stringify(payment.json).slice(0, 300)}`);
      return { intent, gatewayRef: orderId };
    } catch (err) {
      return refuse(err instanceof Error ? err.message : 'request failed');
    }
  }

  async status(merchantRef: string, gatewayRef: string | null): Promise<GatewayStatus> {
    // The order id came from our own server-to-server call (with our amount), so it identifies this payment.
    if (!gatewayRef) return { state: 'pending', raw: { note: 'no order id yet' } };
    const { ok, status, json } = await this.call<{
      data?: {
        status?: string;
        merchant_order_reference?: string;
        order_amount?: { value?: unknown };
        payments?: Array<{ payment_method?: string; status?: string }>;
      };
    }>('GET', `/pay/v1/orders/${encodeURIComponent(gatewayRef)}`);
    if (!ok) throw new Error(`Pine Labs status failed (${status})`);
    const ref = json.data?.merchant_order_reference;
    if (ref !== undefined && ref !== merchantRef) throw new Error('Pine Labs status is for another payment');
    const st = String(json.data?.status ?? '').toUpperCase();
    // Pine Labs amounts are already paise (integers), never rupees.
    const value = json.data?.order_amount?.value;
    const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    const amount = typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
    const paid = json.data?.payments?.find((p) => String(p.status).toUpperCase() === 'PROCESSED') ?? json.data?.payments?.[0];
    return {
      state: SUCCESS.has(st) ? 'success' : FAILED.has(st) ? 'failed' : 'pending',
      amount: SUCCESS.has(st) ? amount : undefined,
      gatewayRef,
      method: typeof paid?.payment_method === 'string' ? paid.payment_method : undefined,
      raw: { status: st, payments: json.data?.payments?.map((p) => ({ method: p.payment_method, status: p.status })) },
    };
  }

  refFromCallback(body: Record<string, unknown>, query: Record<string, unknown>): string | null {
    return pineLabsRef(body, query);
  }
}

/** Webhooks / callbacks only say WHICH payment to check: our merchant_order_reference (top level or under data). */
export function pineLabsRef(body: Record<string, unknown>, query: Record<string, unknown>): string | null {
  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>;
  const ref = data.merchant_order_reference ?? body.merchant_order_reference ?? query.merchant_order_reference;
  return typeof ref === 'string' && ref.length <= 64 ? ref : null;
}
