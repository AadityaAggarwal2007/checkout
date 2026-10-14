import { createHash } from 'node:crypto';
import type { FetchLike, Gateway, GatewayStart, GatewayStatus, PaymentRequest, UpiIntentRequest, UpiIntentStart } from './types.js';
import { paiseFrom, rupees } from './types.js';

export interface PayUCredentials {
  key: string;
  salt: string;
}

const sha512 = (s: string) => createHash('sha512').update(s, 'utf8').digest('hex');

/** PayU's hosted page (enforce_paymethod narrows it to the method chosen in our checkout). */
const METHOD_TO_PAYU: Record<string, string> = {
  upi: 'upi',
  card: 'creditcard|debitcard',
  netbanking: 'netbanking',
  wallet: 'cashcard',
  emi: 'emi',
  pay_later: 'bnpl',
};

/** PayU India, hosted checkout ("_payment") + verify_payment for the server-side check. */
export class PayUGateway implements Gateway {
  private readonly payUrl: string;
  private readonly verifyUrl: string;

  constructor(
    private readonly creds: PayUCredentials,
    mode: 'test' | 'live',
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.payUrl = mode === 'live' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment';
    this.verifyUrl =
      mode === 'live' ? 'https://info.payu.in/merchant/postservice.php?form=2' : 'https://test.payu.in/merchant/postservice.php?form=2';
  }

  /** sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt) */
  static requestHash(f: Record<string, string>, salt: string): string {
    const udf = [f.udf1, f.udf2, f.udf3, f.udf4, f.udf5].map((u) => u ?? '');
    return sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, ...udf, '', '', '', '', '', salt].join('|'));
  }

  /** The _payment fields every PayU request shares (hosted page and server-to-server UPI), hash included. */
  private baseFields(req: PaymentRequest): Record<string, string> {
    const fields: Record<string, string> = {
      key: this.creds.key,
      txnid: req.merchantRef,
      amount: rupees(req.amount),
      productinfo: req.description.replace(/[|]/g, ' ').slice(0, 100),
      firstname: (req.customer.name.split(/\s+/)[0] ?? 'Customer').replace(/[|]/g, '').slice(0, 60) || 'Customer',
      email: req.customer.email || `${req.customer.phone.replace(/\D/g, '').slice(-10)}@noemail.invalid`,
      phone: req.customer.phone.replace(/\D/g, '').slice(-10),
      surl: req.returnUrl,
      furl: req.returnUrl,
      udf1: '',
      udf2: '',
      udf3: '',
      udf4: '',
      udf5: '',
    };
    fields.hash = PayUGateway.requestHash(fields, this.creds.salt);
    return fields;
  }

  async start(req: PaymentRequest): Promise<GatewayStart> {
    const fields = this.baseFields(req);
    const pm = req.method ? METHOD_TO_PAYU[req.method] : undefined;
    if (pm) fields.enforce_paymethod = pm; // not part of the hash
    return { kind: 'post', url: this.payUrl, fields };
  }

  /**
   * UPI Intent, server to server (PayU "txn_s2s_flow=4", pg=UPI, bankcode=INTENT): the same _payment call
   * and hash as the hosted page, answered as JSON with the upi:// link instead of a page. Anything else
   * (HTML, an error, no link, S2S not enabled for this merchant id) is null and the hosted page is used.
   * Tried for every PayU UPI payment; the caller remembers a refusal so it is not asked again for hours.
   */
  async startUpiIntent(req: UpiIntentRequest): Promise<UpiIntentStart | null> {
    const fields = this.baseFields(req);
    Object.assign(fields, {
      pg: 'UPI',
      bankcode: 'INTENT',
      txn_s2s_flow: '4',
      s2s_client_ip: req.clientIp.slice(0, 45),
      s2s_device_info: (req.userAgent || 'unknown').slice(0, 200),
    });
    const res = await this.fetchImpl(this.payUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(fields).toString(),
      // Short: the shopper is waiting, and the hosted page is always there as the fallback.
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    // Why PayU said no, for the server log (its answer carries no secret; long hex strings are cut anyway).
    const refuse = (why: string) => {
      console.warn(`[payu upi-intent] ${req.merchantRef}: ${why}: ${text.replace(/\s+/g, ' ').replace(/[a-f0-9]{40,}/gi, '…').slice(0, 300)}`);
      return null;
    };
    if (!res.ok) return refuse(`HTTP ${res.status}`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return refuse('not JSON'); // a page, not an answer: this merchant id is not set up for S2S
    }
    const intent = upiIntentIn(json, req.amount);
    if (!intent) return refuse('no upi:// link');
    const result = (json as { result?: Record<string, unknown>; metaData?: Record<string, unknown> }).result;
    const meta = (json as { metaData?: Record<string, unknown> }).metaData;
    const ref = result?.mihpayid ?? meta?.referenceId;
    return { intent, gatewayRef: typeof ref === 'string' || typeof ref === 'number' ? String(ref) : undefined };
  }

  async status(merchantRef: string): Promise<GatewayStatus> {
    const command = 'verify_payment';
    const body = new URLSearchParams({
      key: this.creds.key,
      command,
      var1: merchantRef,
      hash: sha512(`${this.creds.key}|${command}|${merchantRef}|${this.creds.salt}`),
    });
    const res = await this.fetchImpl(this.verifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`PayU verify failed (${res.status})`);
    const json = (await res.json()) as { status?: number; transaction_details?: Record<string, Record<string, unknown>> };
    const t = json.transaction_details?.[merchantRef];
    const st = String(t?.status ?? '').toLowerCase();
    const raw = t ? { status: t.status, mihpayid: t.mihpayid, mode: t.mode, amt: t.amt, error_Message: t.error_Message, unmappedstatus: t.unmappedstatus } : json;
    return {
      state: st === 'success' ? 'success' : st === 'failure' || st === 'failed' ? 'failed' : 'pending',
      amount: paiseFrom(t?.amt ?? t?.transaction_amount),
      gatewayRef: t?.mihpayid ? String(t.mihpayid) : undefined,
      method: t?.mode ? String(t.mode) : undefined,
      raw,
    };
  }

  refFromCallback(body: Record<string, unknown>): string | null {
    return typeof body.txnid === 'string' ? body.txnid : null;
  }
}

/** Every string inside a parsed JSON answer, in document order. */
function stringsIn(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out, depth + 1);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsIn(v, out, depth + 1);
  return out;
}

/**
 * The upi://pay link in PayU's answer. Documented as `result.intentURIData`; we also accept the link anywhere in the
 * JSON, and a bare query string ("pa=…&am=…") which we prefix. Refused when it is not a UPI pay link, is too long
 * for a QR, names no payee, or carries an amount other than ours (the shopper would pay the wrong sum).
 */
export function upiIntentIn(json: unknown, amount: number): string | null {
  const strings = stringsIn(json);
  const direct = strings.find((s) => s.startsWith('upi://pay?'));
  const data = (json as { result?: { intentURIData?: unknown } } | null)?.result?.intentURIData;
  const candidate = direct ?? (typeof data === 'string' && /(^|&)pa=/.test(data) ? `upi://pay?${data}` : undefined);
  if (!candidate || candidate.length >= 1000 || /[\s<>"']/.test(candidate)) return null;
  const params = new URLSearchParams(candidate.slice('upi://pay?'.length));
  if (!params.get('pa')) return null;
  const am = params.get('am');
  if (am !== null && paiseFrom(am) !== amount) return null;
  return candidate;
}
