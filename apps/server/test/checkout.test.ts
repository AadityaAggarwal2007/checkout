import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { testKeyFor } from '../src/checkout/service.js';
import { GatewayRegistry } from '../src/payments/registry.js';
import type { Gateway } from '../src/payments/types.js';
import { env, fakeOrderSink, keyring, makeApp, otpOutbox, prisma, resetDb } from './helpers.js';

let app: FastifyInstance;
let storeId: string;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  ({ storeId } = await seedDemo(prisma));
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  otpOutbox.outbox.clear();
  fakeOrderSink.orders.length = 0;
  fakeOrderSink.fail = false;
});

const PHONE = '98765 43210';
const E164 = '+919876543210';
const ADDRESS = { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', email: 'asha@example.com' };

async function start(lines = [{ variantId: '2001', quantity: 2 }], query = `key=${DEMO.widgetKey}`) {
  const res = await app.inject({ method: 'POST', url: `/storefront/checkout?${query}`, payload: { lines, attribution: { utm: { utm_source: 'meta' } } } });
  return res;
}

function client(token: string) {
  let device: string | undefined;
  const headers = () => ({ authorization: `Bearer ${token}`, ...(device ? { 'x-ck-device': device } : {}) });
  const api = {
    setDevice: (d: string | undefined) => (device = d),
    get device() {
      return device;
    },
    async state(): Promise<CheckoutState> {
      const res = await app.inject({ method: 'GET', url: '/checkout/api/session', headers: headers() });
      expect(res.statusCode, res.body).toBe(200);
      return res.json().state;
    },
    post: (url: string, payload: object) => app.inject({ method: 'POST', url, headers: headers(), payload }),
    async login(phone = PHONE) {
      const sent = await api.post('/checkout/api/otp/send', { phone });
      expect(sent.statusCode, sent.body).toBe(200);
      const code = otpOutbox.outbox.get(`+91${phone.replace(/\D/g, '').slice(-10)}`)!;
      const res = await api.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone, code });
      expect(res.statusCode, res.body).toBe(200);
      device = res.json().deviceToken;
      return res.json().state as CheckoutState;
    },
    async address(address: object = ADDRESS) {
      const res = await api.post('/checkout/api/address', { address });
      expect(res.statusCode, res.body).toBe(200);
      return res.json().state as CheckoutState;
    },
    async pay(method: string, expectedTotal: number) {
      return api.post('/checkout/api/pay', { method, expectedTotal });
    },
  };
  return api;
}

async function newCheckout() {
  const res = await start();
  expect(res.statusCode, res.body).toBe(200);
  return client(res.json().token);
}

/** Runs the gateway round trip the way a browser would. */
async function payOnGateway(url: string, result: 'success' | 'failed') {
  const path = new URL(url).pathname;
  const go = await app.inject({ method: 'GET', url: path });
  expect(go.statusCode).toBe(303);
  const gw = new URL(go.headers.location as string).pathname;
  expect(gw).toMatch(/^\/checkout\/dev-gateway\//);
  const posted = await app.inject({ method: 'POST', url: gw, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: `result=${result}` });
  expect(posted.statusCode).toBe(303);
  const back = await app.inject({ method: 'GET', url: posted.headers.location as string });
  expect(back.statusCode).toBe(303);
  return app.inject({ method: 'GET', url: back.headers.location as string });
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('creating a checkout', () => {
  it('is refused while the store has not switched it on, unless testing', async () => {
    await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: false } });
    expect((await start()).statusCode).toBe(403);
    // Guessing a test link does not work; the merchant's one does.
    expect((await start(undefined, `key=${DEMO.widgetKey}&test=1`)).statusCode).toBe(403);
    const key = testKeyFor(env.HASH_PEPPER, storeId);
    expect((await start(undefined, `key=${DEMO.widgetKey}&test=${key}`)).statusCode).toBe(200);
    const cfg = await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}&test=1` });
    expect(cfg.json().checkout.mode).toBe('shopify');
    const test = await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}&test=${key}` });
    expect(test.json().checkout).toEqual({ mode: 'popup', url: env.PUBLIC_URL });
  });

  it('re-reads prices on the server and starts at login', async () => {
    const res = await start([{ variantId: '2001', quantity: 2 }, { variantId: '999999', quantity: 1 }]);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.json().url).toMatch(new RegExp(`^${env.PUBLIC_URL}/checkout/s/\\w+#t=`));
    const state = await client(res.json().token).state();
    expect(state.step).toBe('login');
    expect(state.customer).toBeNull();
    expect(state.lines).toHaveLength(1); // unknown variant dropped
    expect(state.summary.subtotal).toBe(24800);
    const session = await prisma.checkoutSession.findFirstOrThrow({ where: { storeId } });
    expect(session.attribution).toMatchObject({ utm: { utm_source: 'meta' } });
  });

  it('serves the page only inside the store (frame-ancestors) and rejects bad tokens', async () => {
    const res = await start();
    const page = await app.inject({ method: 'GET', url: `/checkout/s/${res.json().sessionId}` });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toContain('frame-ancestors');
    expect(page.headers['content-security-policy']).toContain('https://kurtiya-dev.myshopify.com');
    const bad = await app.inject({ method: 'GET', url: '/checkout/api/session', headers: { authorization: 'Bearer nope' } });
    expect(bad.statusCode).toBe(401);
  });
});

describe('WhatsApp OTP', () => {
  it('sends a code, refuses a wrong one, accepts the right one once', async () => {
    const c = await newCheckout();
    expect((await c.post('/checkout/api/otp/send', { phone: '12345' })).statusCode).toBe(400);
    const sent = await c.post('/checkout/api/otp/send', { phone: PHONE });
    expect(sent.json().phone).toBe('+91 98•••••210');
    const code = otpOutbox.outbox.get(E164)!;
    expect(code).toMatch(/^\d{6}$/);
    const wrong = await c.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone: PHONE, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.statusCode).toBe(400);
    const ok = await c.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone: PHONE, code });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().state.step).toBe('address');
    expect(ok.json().state.customer.phone).toBe(E164);
    const again = await c.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone: PHONE, code });
    expect(again.json().error).toBe('otp_used');
    // The code and the phone are never stored in clear.
    const row = await prisma.otpChallenge.findFirstOrThrow();
    expect(row.codeHash).not.toContain(code);
    expect(row.phoneHash).not.toContain('9876543210');
  });

  it('locks a code after 5 wrong tries and limits resends', async () => {
    const c = await newCheckout();
    const sent = await c.post('/checkout/api/otp/send', { phone: PHONE });
    const code = otpOutbox.outbox.get(E164)!;
    const wrongCode = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await c.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone: PHONE, code: wrongCode });
    const locked = await c.post('/checkout/api/otp/verify', { challengeId: sent.json().challengeId, phone: PHONE, code });
    expect(locked.statusCode).toBe(400);
    expect(['otp_locked', 'otp_used']).toContain(locked.json().error);
    const resend = await c.post('/checkout/api/otp/send', { phone: PHONE });
    expect(resend.statusCode).toBe(429);
  });

  it('a phone number alone shows nothing; a remembered device skips OTP next time', async () => {
    const first = await newCheckout();
    await first.login();
    await first.address();

    // Same phone typed in another browser, no OTP: nothing personal comes back.
    const stranger = await newCheckout();
    await stranger.post('/checkout/api/otp/send', { phone: PHONE });
    const s = await stranger.state();
    expect(s.customer).toBeNull();
    expect(s.addresses).toEqual([]);
    expect(s.address).toBeNull();

    // The first browser starts a new checkout: its device token logs it in, default address chosen.
    const again = await newCheckout();
    again.setDevice(first.device);
    const st = await again.state();
    expect(st.customer?.phone).toBe(E164);
    expect(st.addresses).toHaveLength(1);

    // "Not you?" forgets the device.
    const out = await again.post('/checkout/api/logout', {});
    expect(out.json().state.step).toBe('login');
    const after = await newCheckout();
    after.setDevice(first.device);
    expect((await after.state()).customer).toBeNull();
  });

  it('a returning shopper with a saved address lands on payment after OTP', async () => {
    const first = await newCheckout();
    await first.login();
    await first.address();
    await prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } }); // past the 30 s resend wait
    const second = await newCheckout();
    const st = await second.login();
    expect(st.step).toBe('payment');
    expect(st.address?.pincode).toBe('302001');
  });
});

describe('address and pricing', () => {
  it('needs OTP before an address, validates it and prices shipping and COD', async () => {
    const c = await newCheckout();
    expect((await c.post('/checkout/api/address', { address: ADDRESS })).statusCode).toBe(401);
    await c.login();
    const bad = await c.post('/checkout/api/address', { address: { ...ADDRESS, pincode: '12' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toMatch(/pincode/);
    const st = await c.address();
    expect(st.step).toBe('payment');
    // B1G1 on 2 × ₹124, prepaid 5% → ₹117.80 + ₹30 shipping (below ₹199)
    expect(st.summary).toMatchObject({ subtotal: 24800, discount: 12400 + 620, shipping: 3000, total: 14780 });
    const upi = st.methods.find((m) => m.method === 'upi')!;
    const cod = st.methods.find((m) => m.method === 'cod')!;
    expect(upi.total).toBe(14780);
    expect(cod.total).toBe(12400 + 3000); // PREPAID 5% does not apply to COD
    expect(upi.extraSaving).toBe(620);
    expect(st.methods.some((m) => m.method === 'partial_cod')).toBe(false); // off by default
  });

  it('looks up pincodes', async () => {
    const c = await newCheckout();
    const res = await app.inject({ method: 'GET', url: '/checkout/api/pincode/302001', headers: { authorization: `Bearer ${(await start()).json().token}` } });
    expect(res.json()).toEqual({ city: 'Jaipur', state: 'Rajasthan' });
    void c;
  });

  it('applies and removes a typed code', async () => {
    const c = await newCheckout();
    const res = await c.post('/checkout/api/coupon', { add: 'nope' });
    expect(res.json().state.coupons.rejected[0]).toMatchObject({ code: 'NOPE' });
    const removed = await c.post('/checkout/api/coupon', { remove: 'B1G1' });
    expect(removed.json().state.summary.discount).toBe(Math.round(24800 * 0.05)); // B1G1 taken off, prepaid 5% stays
  });
});

describe('cash on delivery', () => {
  it('places the order once, with the 1% fee, coupon uses and Shopify copy', async () => {
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    const cod = st.methods.find((m) => m.method === 'cod')!;

    const wrong = await c.pay('cod', cod.total - 100);
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().error).toBe('price_changed');
    expect(wrong.json().state.methods).toBeDefined();

    const res = await c.pay('cod', cod.total);
    expect(res.statusCode, res.body).toBe(200);
    const done: CheckoutState = res.json().state;
    expect(done.step).toBe('done');
    expect(done.order).toMatchObject({ number: 'CK1001', total: 15400, paidAmount: 0, dueOnDelivery: 15400, paymentMode: 'COD' });

    const order = await prisma.order.findFirstOrThrow({ include: { lines: true, usageCharge: true, redemptions: true } });
    expect(order.paymentStatus).toBe('COD_CONFIRMED');
    expect(order.usageCharge?.amount).toBe(154); // 1% of ₹154
    expect(order.redemptions).toHaveLength(1); // B1G1 only
    expect(order.lines[0]).toMatchObject({ variantId: '2001', quantity: 2, discount: 12400 });
    const customer = await prisma.customer.findFirstOrThrow();
    expect(customer).toMatchObject({ orderCount: 1, codOrderCount: 1, lifetimeSpend: 15400, name: 'Asha Verma' });
    await settle();
    expect(fakeOrderSink.orders).toEqual([{ number: 'CK1001', total: 15400 }]);
    expect((await prisma.order.findFirstOrThrow()).shopifyName).toBe('#1001');

    // Paying again on the same checkout does nothing.
    expect((await c.pay('cod', cod.total)).statusCode).toBe(409);
    expect(await prisma.order.count()).toBe(1);
  });

  it('keeps the order when Shopify is down (retried later)', async () => {
    fakeOrderSink.fail = true;
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    await c.pay('cod', st.methods.find((m) => m.method === 'cod')!.total);
    await settle();
    const order = await prisma.order.findFirstOrThrow();
    expect(order.shopifyOrderId).toBeNull();
    expect(order.shopifyError).toContain('Shopify is down');
  });

  it('is not offered when the store switches COD off', async () => {
    await prisma.storeSettings.update({ where: { storeId }, data: { codEnabled: false } });
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    expect(st.methods.some((m) => m.method === 'cod')).toBe(false);
    expect(st.codReasons[0]).toMatch(/not offered/);
    expect((await c.pay('cod', 15400)).json().error).toBe('method_unavailable');
  });
});

describe('online payment', () => {
  it('is paid only after the gateway confirms, then shows thank-you', async () => {
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    const upi = st.methods.find((m) => m.method === 'upi')!;
    const res = await c.pay('upi', upi.total);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().pay.url).toMatch(/\/checkout\/go\/ck/);
    expect(res.json().state.step).toBe('processing');
    expect(await prisma.order.count()).toBe(0);

    const page = await payOnGateway(res.json().pay.url, 'success');
    expect(page.body).toContain('Your order is placed');
    expect(page.body).toContain('CK1001');
    const order = await prisma.order.findFirstOrThrow({ include: { transactions: true } });
    expect(order).toMatchObject({ paymentMode: 'PREPAID', paymentStatus: 'PAID', total: 14780, paidAmount: 14780, dueOnDelivery: 0 });
    expect(order.transactions[0]).toMatchObject({ status: 'SUCCESS', amount: 14780 });
    expect(order.transactions[0]!.verifiedAt).not.toBeNull();
    expect((await c.state()).step).toBe('done');
  });

  it('a failed payment goes back to the payment step and can be retried', async () => {
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    const upi = st.methods.find((m) => m.method === 'upi')!;
    const first = await c.pay('upi', upi.total);
    const page = await payOnGateway(first.json().pay.url, 'failed');
    expect(page.body).toContain('Payment did not go through');
    expect(page.body).toContain('#ck_resume=');
    const after = await c.state();
    expect(after.step).toBe('payment');
    expect(after.payment.status).toBe('failed');

    const second = await c.pay('card', after.methods.find((m) => m.method === 'card')!.total);
    await payOnGateway(second.json().pay.url, 'success');
    expect((await c.state()).order?.number).toBe('CK1001');
    expect(await prisma.paymentTransaction.count({ where: { status: 'FAILED' } })).toBe(1);
  });

  it('partial COD collects the advance online and the rest on delivery', async () => {
    await prisma.storeSettings.update({ where: { storeId }, data: { partialCodEnabled: true, partialCodType: 'fixed', partialCodValue: 5000 } });
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    const partial = st.methods.find((m) => m.method === 'partial_cod')!;
    expect(partial).toMatchObject({ payNow: 5000, payOnDelivery: partial.total - 5000 });
    const res = await c.pay('partial_cod', partial.total);
    const txn = await prisma.paymentTransaction.findFirstOrThrow();
    expect(txn.amount).toBe(5000);
    await payOnGateway(res.json().pay.url, 'success');
    const order = await prisma.order.findFirstOrThrow();
    expect(order).toMatchObject({ paymentMode: 'PARTIAL_COD', paymentStatus: 'PARTIALLY_PAID', paidAmount: 5000, dueOnDelivery: partial.total - 5000 });
  });

  it('never accepts a payment of another amount', async () => {
    const lying: Gateway = {
      start: async (req) => ({ kind: 'redirect', url: `${env.PUBLIC_URL}/x?${req.merchantRef}` }),
      status: async () => ({ state: 'success', amount: 100, raw: {} }),
      refFromCallback: () => null,
    };
    class Fake extends GatewayRegistry {
      override for() {
        return lying;
      }
    }
    const other = await makeApp({ gateways: new Fake({ env, prisma, keyring }) });
    const res = await other.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2001', quantity: 2 }] } });
    const token = res.json().token;
    const headers = { authorization: `Bearer ${token}` };
    const sent = await other.inject({ method: 'POST', url: '/checkout/api/otp/send', headers, payload: { phone: PHONE } });
    const ver = await other.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers, payload: { challengeId: sent.json().challengeId, phone: PHONE, code: otpOutbox.outbox.get(E164) } });
    const h2 = { ...headers, 'x-ck-device': ver.json().deviceToken };
    const st = (await other.inject({ method: 'POST', url: '/checkout/api/address', headers: h2, payload: { address: ADDRESS } })).json().state as CheckoutState;
    const pay = await other.inject({ method: 'POST', url: '/checkout/api/pay', headers: h2, payload: { method: 'upi', expectedTotal: st.methods.find((m) => m.method === 'upi')!.total } });
    const ref = pay.json().pay.ref;
    await other.inject({ method: 'GET', url: `/checkout/go/${ref}` });
    await other.inject({ method: 'POST', url: `/checkout/return/${ref}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'status=success' });
    expect(await prisma.order.count()).toBe(0);
    const txn = await prisma.paymentTransaction.findFirstOrThrow();
    expect(txn.status).toBe('FAILED');
    expect(JSON.stringify(txn.raw)).toContain('amount mismatch');
    await other.close();
  });

  it('a webhook only triggers a re-check, and the same delivery is handled once', async () => {
    const c = await newCheckout();
    await c.login();
    const st = await c.address();
    const pay = await c.pay('upi', st.methods.find((m) => m.method === 'upi')!.total);
    const ref = pay.json().pay.ref;
    // A forged "success" body changes nothing: the gateway has not confirmed.
    const body = `txnid=${ref}&status=success&amount=147.80`;
    const hook = () => app.inject({ method: 'POST', url: '/webhooks/gateway/payu', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: body });
    expect((await hook()).statusCode).toBe(200);
    expect((await hook()).statusCode).toBe(200);
    expect(await prisma.gatewayEvent.count()).toBe(1);
    expect(await prisma.order.count()).toBe(0);
  });
});
