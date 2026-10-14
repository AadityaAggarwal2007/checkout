import { createHash } from 'node:crypto';
import type { FetchLike, Gateway, GatewayStart, GatewayStatus, PaymentRequest } from './types.js';
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

  async start(req: PaymentRequest): Promise<GatewayStart> {
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
    const pm = req.method ? METHOD_TO_PAYU[req.method] : undefined;
    if (pm) fields.enforce_paymethod = pm;
    fields.hash = PayUGateway.requestHash(fields, this.creds.salt);
    return { kind: 'post', url: this.payUrl, fields };
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
