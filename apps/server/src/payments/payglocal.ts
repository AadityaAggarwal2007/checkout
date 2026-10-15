import { createHash } from 'node:crypto';
import { CompactEncrypt, CompactSign, decodeJwt, importPKCS8, importSPKI, type KeyLike } from 'jose';
import type { FetchLike, Gateway, GatewayStart, GatewayStatus, PaymentRequest, UpiIntentRequest, UpiIntentStart } from './types.js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { upiIntentIn } from './payu.js';
import { paiseFrom, rupees } from './types.js';

export interface PayGlocalCredentials {
  merchantId: string;
  publicKeyId: string;
  privateKeyId: string;
  /** PayGlocal's public key (SPKI PEM) — encrypts our requests. */
  payglocalPublicKey: string;
  /** Our private key (PKCS8 PEM) — signs our requests. */
  merchantPrivateKey: string;
}

const TOKEN_EXPIRY_MS = 300_000;
const SUCCESS = new Set(['SENT_FOR_CAPTURE', 'CAPTURED', 'SUCCESS', 'AUTHORIZED']);
const FAILED = new Set(['ISSUER_DECLINE', 'FAILED', 'FAILURE', 'ABANDONED', 'REQUEST_ERROR', 'CUSTOMER_CANCELLED', 'DECLINED', 'EXPIRED']);

/**
 * PayGlocal "paycollect" (hosted page). Requests are JWE (encrypted to PayGlocal's key) and
 * carry a JWS (signed with the merchant's key) of the JWE digest, as in the old server.
 */
export class PayGlocalGateway implements Gateway {
  private readonly base: string;
  private keys?: { pg: KeyLike; merchant: KeyLike };

  constructor(
    private readonly creds: PayGlocalCredentials,
    mode: 'test' | 'live',
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.base = mode === 'live' ? 'https://api.payglocal.in' : 'https://api.uat.payglocal.in';
  }

  private async loadKeys() {
    this.keys ??= {
      pg: await importSPKI(this.creds.payglocalPublicKey.trim(), 'RSA-OAEP-256'),
      merchant: await importPKCS8(this.creds.merchantPrivateKey.trim(), 'RS256'),
    };
    return this.keys;
  }

  async jwe(payload: unknown): Promise<string> {
    const { pg } = await this.loadKeys();
    return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A128CBC-HS256',
        kid: this.creds.publicKeyId,
        'issued-by': this.creds.merchantId,
        exp: TOKEN_EXPIRY_MS,
        iat: `${Date.now()}`,
      })
      .encrypt(pg);
  }

  /** JWS over sha256(content): content is the JWE for a POST, the request path for a status GET. */
  async jws(content: string, encrypted: boolean): Promise<string> {
    const { merchant } = await this.loadKeys();
    const digest = createHash('sha256').update(content).digest('base64');
    return new CompactSign(new TextEncoder().encode(JSON.stringify({ digest, digestAlgorithm: 'SHA-256', exp: TOKEN_EXPIRY_MS, iat: `${Date.now()}` })))
      .setProtectedHeader({
        alg: 'RS256',
        kid: this.creds.privateKeyId,
        'x-gl-merchantId': this.creds.merchantId,
        'issued-by': this.creds.merchantId,
        'is-digested': 'true',
        'x-gl-enc': encrypted ? 'true' : 'false',
      })
      .sign(merchant);
  }

  /** Exactly what PayGlocal's own client sends: the JWS in x-gl-token-external, nothing else of ours. */
  private headers(jws: string): Record<string, string> {
    return { 'x-gl-token-external': jws };
  }

  /** PayCollect initiate: PayGlocal's hosted page for this payment (its URL carries the page's x-gl-token). */
  private async initiate(req: PaymentRequest): Promise<{ url: string; gid?: string }> {
    const [first, ...rest] = req.customer.name.trim().split(/\s+/);
    const payload = {
      merchantTxnId: req.merchantRef,
      merchantUniqueId: req.merchantRef,
      paymentData: {
        totalAmount: rupees(req.amount),
        txnCurrency: 'INR',
        billingData: {
          firstName: first || 'Customer',
          lastName: rest.join(' ') || '.',
          emailId: req.customer.email || undefined,
          phoneNumber: req.customer.phone.replace(/\D/g, '').slice(-10),
          addressCountry: 'IN',
        },
      },
      merchantCallbackURL: req.returnUrl,
    };
    const jwe = await this.jwe(payload);
    const res = await this.fetchImpl(`${this.base}/gl/v1/payments/initiate/paycollect`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', ...this.headers(await this.jws(jwe, true)) },
      body: jwe,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as { status?: string; gid?: string; message?: string; data?: { redirectUrl?: string } };
    if (!res.ok || !data.data?.redirectUrl) throw new Error(`PayGlocal initiate failed (${res.status}): ${data.message ?? data.status ?? 'no redirect'}`);
    return { url: data.data.redirectUrl, gid: data.gid };
  }

  async start(req: PaymentRequest): Promise<GatewayStart> {
    const { url, gid } = await this.initiate(req);
    return { kind: 'redirect', url, gatewayRef: gid };
  }

  /**
   * UPI QR inside our checkout, like PayU's S2S intent. PayGlocal documents only the hosted page, so this does what
   * that page does when the shopper presses "Generate QR", for the payment we just initiated: read the page data
   * (GET …/redirect/dc), then ask the page's UPI endpoint for the upi:// link (customerDeviceType WEB). The token is
   * the one PayGlocal gave us in the page URL. Anything unexpected = null = the caller uses the hosted page instead.
   * The payment is still confirmed only by status() (server to server, amount checked).
   */
  async startUpiIntent(req: UpiIntentRequest): Promise<UpiIntentStart | null> {
    const refuse = (why: string): null => {
      console.warn(`[payglocal upi-intent] ${req.merchantRef}: ${why}`);
      return null;
    };
    let page: URL;
    let gid: string | undefined;
    try {
      const started = await this.initiate(req);
      page = new URL(started.url);
      gid = started.gid;
    } catch (err) {
      return refuse(err instanceof Error ? err.message : 'initiate failed');
    }
    const token = page.searchParams.get('x-gl-token');
    if (!token || page.protocol !== 'https:' || !/(^|\.)payglocal\.(com|in)$/.test(page.hostname)) return refuse('no page token');
    const origin = page.origin;
    const common = {
      accept: 'application/json, text/plain, */*',
      'user-agent': req.userAgent || 'Mozilla/5.0',
      'x-gl-current-host': page.host,
      'x-gl-gid': gid ?? '',
      referer: `${origin}/gl/payflow-ui/`,
      origin,
    };
    const ask = async (url: string, init: RequestInit): Promise<unknown> => {
      const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text) as unknown;
    };
    try {
      const dc = await ask(`${origin}/gl/v2/payments/redirect/dc?x-gl-token=${encodeURIComponent(token)}`, { headers: common });
      const action = valueOf(dc, 'indUpiPaynowUrl');
      if (typeof action !== 'string' || !action) return refuse('page data has no UPI endpoint');
      const target = new URL(action, origin);
      if (target.origin !== origin) return refuse('UPI endpoint on another host');
      target.searchParams.set('x-gl-token', token);
      const answer = await ask(target.toString(), {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json' },
        body: JSON.stringify({ customerCurrency: 'INR', customerDeviceType: 'WEB', upiData: {}, agreedOnTnCs: false }),
      });
      // The page's answer: upiData { qrCode: base64 PNG (WEB), deepLink: upi:// (MOBILE), timerSeconds }.
      const upiData = valueOf(answer, 'upiData') as { qrCode?: unknown; deepLink?: unknown } | undefined;
      const fromQr = typeof upiData?.qrCode === 'string' ? qrText(upiData.qrCode) : null;
      const intent = upiIntentIn({ deepLink: upiData?.deepLink, qr: fromQr }, req.amount);
      if (!intent) return refuse(`no upi:// link for our amount: ${JSON.stringify(shapeOf(upiData ?? answer)).slice(0, 600)}`);
      return { intent, gatewayRef: gid };
    } catch (err) {
      return refuse(err instanceof Error ? err.message : 'UPI request failed');
    }
  }

  async status(_merchantRef: string, gatewayRef: string | null): Promise<GatewayStatus> {
    // The gid came from our own server-to-server initiate (with our amount), so it identifies this payment.
    if (!gatewayRef) return { state: 'pending', raw: { note: 'no gid yet' } };
    const path = `/gl/v1/payments/${encodeURIComponent(gatewayRef)}/status`;
    const res = await this.fetchImpl(`${this.base}${path}`, { headers: this.headers(await this.jws(path, false)), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`PayGlocal status failed (${res.status})`);
    const json = (await res.json()) as { status?: string; gid?: string; data?: Record<string, unknown> };
    const st = String(json.data?.status ?? json.status ?? '').toUpperCase();
    const amount = paiseFrom(json.data?.Amount ?? json.data?.amount ?? json.data?.totalAmount);
    return {
      state: SUCCESS.has(st) ? 'success' : FAILED.has(st) ? 'failed' : 'pending',
      amount,
      gatewayRef: json.gid ?? gatewayRef,
      method: typeof json.data?.paymentMethod === 'string' ? json.data.paymentMethod : undefined,
      raw: { status: json.status, gid: json.gid, dataStatus: json.data?.status, amount: json.data?.Amount ?? json.data?.amount, reason: json.data?.reasonCode },
    };
  }

  /** The callback's x-gl-token is only read to find the payment; the status call decides. */
  refFromCallback(body: Record<string, unknown>): string | null {
    const token = body['x-gl-token'];
    if (typeof token !== 'string') return null;
    try {
      const claims = decodeJwt(token) as { merchantTxnId?: unknown };
      return typeof claims.merchantTxnId === 'string' ? claims.merchantTxnId : null;
    } catch {
      return null;
    }
  }
}

/** First value under `key` anywhere in a JSON answer (PayGlocal nests its page data a few levels down). */
function valueOf(value: unknown, key: string, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;
  if (!Array.isArray(value) && key in value) return (value as Record<string, unknown>)[key];
  for (const v of Object.values(value)) {
    const found = valueOf(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Keys and value types only, for the log when PayGlocal answers in a shape we do not know (no ids, no links). */
function shapeOf(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return depth > 3 ? '[…]' : value.slice(0, 2).map((v) => shapeOf(v, depth + 1));
  if (value && typeof value === 'object') return depth > 3 ? '{…}' : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v, depth + 1)]));
  return typeof value;
}

/** The text inside PayGlocal's QR image (a base64 PNG): their UPI pay link. Null when it is not a readable QR. */
export function qrText(base64: string): string | null {
  try {
    const buf = Buffer.from(base64.replace(/^data:image\/[a-z]+;base64,/i, '').trim(), 'base64');
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    const png = PNG.sync.read(buf);
    if (png.width * png.height > 4_000_000) return null;
    const code = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height);
    return code?.data ?? null;
  } catch {
    return null;
  }
}
