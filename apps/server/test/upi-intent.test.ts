import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPI_INTENT_RETRY_MS, UPI_INTENT_TTL_MS } from '../src/checkout/service.js';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { upiIntentIn } from '../src/payments/payu.js';
import { GatewayRegistry } from '../src/payments/registry.js';
import { env, keyring, makeApp, otpOutbox, prisma, resetDb } from './helpers.js';

const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** PayU, faked: _payment answers whatever the test says; verify_payment answers from the test's status. */
let paymentAnswer: (form: URLSearchParams) => Response;
let verifyStatus: (amountRupees: string) => Record<string, unknown>;
const payuCalls: URLSearchParams[] = [];
const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
  const form = new URLSearchParams(String(init?.body ?? ''));
  if (url.endsWith('/_payment')) {
    payuCalls.push(form);
    return paymentAnswer(form);
  }
  if (url.includes('postservice.php')) {
    const ref = form.get('var1')!;
    const txn = await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: ref } });
    return json({ status: 1, transaction_details: { [ref]: verifyStatus((txn.amount / 100).toFixed(2)) } });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const intentAnswer = (form: URLSearchParams) =>
  json({
    metaData: { referenceId: 'ref-1', txnStatus: 'PENDING' },
    result: { mihpayid: '403993715', status: 'pending', intentURIData: `upi://pay?pa=merchant@payu&pn=Kurtiya&tr=${form.get('txnid')}&am=${form.get('amount')}&cu=INR` },
  });

let app: FastifyInstance;
let storeId: string;

beforeAll(async () => {
  app = await makeApp({ gateways: new GatewayRegistry({ env, prisma, keyring }, fetchImpl) });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  ({ storeId } = await seedDemo(prisma));
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
  // Every test gets a new account id, so the service's refusal memory starts empty for it.
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'PAYU', mode: 'test', active: true, credentialsEnc: keyring.encryptJson({ key: 'KEY1', salt: 'SALT1' }) } });
  otpOutbox.outbox.clear();
  payuCalls.length = 0;
  paymentAnswer = intentAnswer;
  verifyStatus = () => ({ status: 'pending' });
});
afterEach(() => vi.useRealTimers());

let phoneSeq = 0;
/** A verified shopper at the payment step. */
async function shopper() {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2021', quantity: 1 }] } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const number = `94${String(76600000 + ++phoneSeq)}`;
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  const headers = { ...auth, 'x-ck-device': ver.json().deviceToken as string, 'user-agent': 'TestBrowser/1.0' };
  const state = (await app.inject({ method: 'POST', url: '/checkout/api/address', headers, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } })).json().state as CheckoutState;
  return {
    state,
    pay: async (method = 'upi') => {
      const m = state.methods.find((x) => x.method === method)!;
      const res = await app.inject({ method: 'POST', url: '/checkout/api/pay', headers, payload: { method, expectedTotal: m.total } });
      expect(res.statusCode, res.body).toBe(200);
      return res.json() as { pay: { url: string; ref: string } | null; upi: { intent: string; expiresAt: number } | null; state: CheckoutState };
    },
    session: async () => (await app.inject({ method: 'GET', url: '/checkout/api/session', headers })).json().state as CheckoutState,
  };
}

describe('UPI inside the checkout (PayU intent, server to server)', () => {
  it('starts the payment with PayU and returns the upi:// link; the transaction waits as PENDING', async () => {
    const s = await shopper();
    expect(s.state.inlineUpi).toBe(true);
    const before = Date.now();
    const out = await s.pay();
    expect(out.upi?.intent).toMatch(/^upi:\/\/pay\?pa=merchant@payu/);
    expect(out.upi!.expiresAt).toBeGreaterThanOrEqual(before + UPI_INTENT_TTL_MS - 1000);
    expect(out.pay?.ref).toBeTruthy();
    expect(out.state.step).toBe('processing');
    expect(out.state.payment.upi?.intent).toBe(out.upi!.intent);

    // What went to PayU: the hosted-page fields plus the S2S ones, the documented hash, never the salt.
    const form = payuCalls[0]!;
    expect(form.get('pg')).toBe('UPI');
    expect(form.get('bankcode')).toBe('INTENT');
    expect(form.get('txn_s2s_flow')).toBe('4');
    expect(form.get('s2s_client_ip')).toBeTruthy();
    expect(form.get('s2s_device_info')).toBe('TestBrowser/1.0');
    expect(form.get('txnid')).toBe(out.pay!.ref);
    expect(form.get('hash')).toBe(sha512(`KEY1|${out.pay!.ref}|${form.get('amount')}|${form.get('productinfo')}|Asha|${form.get('email')}|||||||||||SALT1`));
    expect(form.toString()).not.toContain('SALT1');

    const txn = await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: out.pay!.ref } });
    expect(txn.status).toBe('PENDING');
    expect(txn.gatewayRef).toBe('403993715');
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
  });

  it('is confirmed only by verify_payment with the matching amount, like every other payment', async () => {
    const s = await shopper();
    const out = await s.pay();
    // Still pending: nothing placed, the QR is still offered.
    let state = await s.session();
    expect(state.step).toBe('processing');
    expect(state.payment.upi).toBeTruthy();

    // PayU says paid, but another amount: refused, the shopper is back at the methods.
    verifyStatus = () => ({ status: 'success', amt: '1.00', mihpayid: '403993715', mode: 'UPI' });
    await new Promise((r) => setTimeout(r, 10));
    const ref = out.pay!.ref;
    expect(await app.checkout.settle(ref)).toBe('failed');
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
    expect((await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: ref } })).status).toBe('FAILED');

    // A fresh payment, really paid: the poll's refresh places the order.
    verifyStatus = (amt) => ({ status: 'success', amt, mihpayid: '403993716', mode: 'UPI' });
    const again = await s.pay();
    expect(again.upi).toBeTruthy();
    state = await s.session();
    expect(state.step).toBe('done');
    const order = await prisma.order.findFirstOrThrow({ where: { storeId } });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.paidAmount).toBe((await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: again.pay!.ref } })).amount);
  });

  it('falls back to the hosted page when PayU answers a page, an error or a bad link', async () => {
    paymentAnswer = () => new Response('<html>Not enabled</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const s = await shopper();
    const out = await s.pay();
    expect(out.upi).toBeNull();
    expect(out.pay?.url).toMatch(/\/checkout\/go\//);
    expect(out.state.step).toBe('processing');
    expect(out.state.payment.upi).toBeUndefined();
    const txn = await prisma.paymentTransaction.findUniqueOrThrow({ where: { merchantRef: out.pay!.ref } });
    expect(txn.status).toBe('CREATED'); // /checkout/go/:ref starts the hosted page as before
    // The hosted page uses a fresh reference: PayU may have kept the refused S2S one.
    expect(out.pay!.ref).not.toBe(payuCalls[0]!.get('txnid'));
    expect(txn.raw).toBeNull();
    const go = await app.inject({ method: 'GET', url: out.pay!.url.replace(env.PUBLIC_URL, '') });
    expect(go.statusCode).toBe(200);
    expect(go.body).toContain('https://test.payu.in/_payment');
    expect(go.body).toContain('enforce_paymethod');
  });

  it('remembers a refusal for the account and does not ask PayU again for 6 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    paymentAnswer = () => json({ status: 0, message: 'S2S not enabled for this merchant' });
    const first = await shopper();
    expect(first.state.inlineUpi).toBe(true);
    expect((await first.pay()).upi).toBeNull();
    expect(payuCalls).toHaveLength(1);

    // The next UPI shopper on this account is not kept waiting: straight to the hosted page.
    const second = await shopper();
    expect(second.state.inlineUpi).toBe(false);
    expect((await second.pay()).upi).toBeNull();
    expect(payuCalls).toHaveLength(1);

    // Six hours later we try once more; a success clears the memory.
    vi.setSystemTime(Date.now() + UPI_INTENT_RETRY_MS + 1000);
    paymentAnswer = intentAnswer;
    const third = await shopper();
    expect(third.state.inlineUpi).toBe(true);
    expect((await third.pay()).upi).toBeTruthy();
    expect(payuCalls).toHaveLength(2);
    const fourth = await shopper();
    expect((await fourth.pay()).upi).toBeTruthy();
    expect(payuCalls).toHaveLength(3);
  });

  it('only UPI goes server to server; a card payment uses the hosted page without asking', async () => {
    const s = await shopper();
    const out = await s.pay('card');
    expect(out.upi).toBeNull();
    expect(payuCalls).toHaveLength(0);
    expect(out.pay?.url).toMatch(/\/checkout\/go\//);
  });

  it('reads the intent out of PayU answers defensively', () => {
    const ok = 'upi://pay?pa=m@payu&pn=X&tr=ck1&am=147.80&cu=INR';
    expect(upiIntentIn({ result: { intentURIData: ok } }, 14780)).toBe(ok);
    expect(upiIntentIn({ metaData: { deepLink: ok } }, 14780)).toBe(ok);
    expect(upiIntentIn({ result: { intentURIData: 'pa=m@payu&pn=X&tr=ck1&am=147.8&cu=INR' } }, 14780)).toBe('upi://pay?pa=m@payu&pn=X&tr=ck1&am=147.8&cu=INR');
    expect(upiIntentIn({ result: { intentURIData: ok } }, 100)).toBeNull(); // another amount
    expect(upiIntentIn({ result: { intentURIData: 'upi://pay?pn=X&am=147.80' } }, 14780)).toBeNull(); // no payee
    expect(upiIntentIn({ result: { intentURIData: `${ok}&x=${'a'.repeat(1000)}` } }, 14780)).toBeNull(); // too long for a QR
    expect(upiIntentIn({ result: { intentURIData: 'https://secure.payu.in/upi' } }, 14780)).toBeNull();
    expect(upiIntentIn({ status: 0, message: 'error' }, 14780)).toBeNull();
    expect(upiIntentIn('upi://pay?pa=m@payu', 14780)).toBe('upi://pay?pa=m@payu'); // no amount in the link: ours applies
  });
});
