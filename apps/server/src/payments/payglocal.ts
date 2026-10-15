import { createHash } from 'node:crypto';
import { CompactEncrypt, CompactSign, decodeJwt, importPKCS8, importSPKI, type KeyLike } from 'jose';
import type { FetchLike, Gateway, GatewayStart, GatewayStatus, PaymentRequest } from './types.js';
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

  async start(req: PaymentRequest): Promise<GatewayStart> {
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
    return { kind: 'redirect', url: data.data.redirectUrl, gatewayRef: data.gid };
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
