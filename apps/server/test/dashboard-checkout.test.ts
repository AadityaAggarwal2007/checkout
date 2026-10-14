import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { cookieFrom, makeApp, otpOutbox, prisma, resetDb, signup } from './helpers.js';

let app: FastifyInstance;
let storeId: string;
let cookie: string;

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
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: DEMO.email, password: DEMO.password } });
  cookie = cookieFrom(res, 'ck_session')!;
});

const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

const SETTINGS = {
  checkoutEnabled: true,
  codEnabled: true,
  codFee: 0,
  codConfirmPopup: true,
  partialCod: { enabled: true, type: 'percent', amount: 0, percent: 20, min: 5000, max: null },
};
const PEM = (kind: string) => `-----BEGIN ${kind}-----\nMIIBfake\n-----END ${kind}-----`;

describe('Settings > Payments', () => {
  it('stores gateway secrets encrypted and never shows them back', async () => {
    const res = await call('PUT', '/gateways/payu', { mode: 'test', active: true, credentials: { key: 'gtKFFx', salt: 'super-secret-salt' } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).not.toContain('super-secret-salt');
    const gw = res.json().gateways.find((g: { provider: string }) => g.provider === 'PAYU');
    expect(gw).toMatchObject({ mode: 'test', active: true, publicInfo: { key: 'gtKFFx' }, secretsSet: ['salt'] });
    expect(gw.webhookUrl).toMatch(/\/webhooks\/gateway\/payu$/);
    const row = await prisma.gatewayAccount.findFirstOrThrow({ where: { provider: 'PAYU' } });
    expect(row.credentialsEnc).not.toContain('super-secret-salt');

    // Saving again without the salt keeps the saved one.
    const again = await call('PUT', '/gateways/payu', { mode: 'live', active: true, credentials: { key: 'gtKFFx', salt: '' } });
    expect(again.statusCode).toBe(200);
    const creds = app.deps.keyring.decryptJson<{ salt: string }>((await prisma.gatewayAccount.findFirstOrThrow({ where: { provider: 'PAYU' } })).credentialsEnc);
    expect(creds.salt).toBe('super-secret-salt');
    expect((await app.inject({ method: 'GET', url: `/api/stores/${storeId}/payments`, headers: { cookie: `ck_session=${cookie}` } })).body).not.toContain('super-secret');
  });

  it('checks PayGlocal keys and names the missing field', async () => {
    const res = await call('PUT', '/gateways/payglocal', { mode: 'test', active: true, credentials: { merchantId: 'MID1', publicKeyId: 'k1', privateKeyId: 'k2', payglocalPublicKey: PEM('PUBLIC KEY') } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Your private key/);
    const ok = await call('PUT', '/gateways/payglocal', {
      mode: 'test',
      active: true,
      credentials: { merchantId: 'MID1', publicKeyId: 'k1', privateKeyId: 'k2', payglocalPublicKey: PEM('PUBLIC KEY'), merchantPrivateKey: PEM('PRIVATE KEY') },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).not.toContain('MIIBfake\n-----END PRIVATE');
  });

  it('will not switch the checkout on with nothing to pay with, and saves COD / partial COD', async () => {
    const none = await call('PUT', '/payments/settings', { ...SETTINGS, codEnabled: false });
    expect(none.json().error).toBe('nothing_to_pay_with');
    const ok = await call('PUT', '/payments/settings', SETTINGS);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().settings.partialCod).toMatchObject({ enabled: true, type: 'percent', percent: 20, min: 5000 });
    const s = await prisma.storeSettings.findUniqueOrThrow({ where: { storeId } });
    expect(s).toMatchObject({ checkoutEnabled: true, partialCodType: 'percent', partialCodValue: 2000 });
    expect(await prisma.activityLog.count({ where: { storeId, action: 'checkout.switch' } })).toBe(1);
  });

  it('routes methods only to gateways the store has', async () => {
    expect((await call('PUT', '/payment-routes', { routes: { upi: 'PAYU' } })).statusCode).toBe(400);
    await call('PUT', '/gateways/payu', { mode: 'test', active: true, credentials: { key: 'gtKFFx', salt: 'saltsalt' } });
    const ok = await call('PUT', '/payment-routes', { routes: { upi: 'PAYU', card: 'PAYU', cod: null } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().routes).toEqual({ upi: 'PAYU', card: 'PAYU' });
  });

  it('is closed to other merchants and to viewers', async () => {
    const stranger = await signup(app, 'other@example.com');
    expect((await call('GET', '/payments', undefined, stranger)).statusCode).toBe(404);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'other@example.com' } });
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: 'VIEWER' } });
    expect((await call('GET', '/payments', undefined, stranger)).statusCode).toBe(403);
  });
});

describe('Settings > Shipping', () => {
  it('saves zones, refuses overlapping slabs and warns about a "free" rate that charges', async () => {
    const bad = await call('PUT', '/shipping', {
      zones: [{ name: 'India', states: [], rates: [{ name: 'Std', slabs: [{ min: 0, max: 50000, charge: 4000 }, { min: 40000, max: null, charge: 0 }] }] }],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toMatch(/overlap/);
    const ok = await call('PUT', '/shipping', {
      zones: [
        { name: 'North East', states: ['Assam', 'Manipur'], rates: [{ name: 'Free shipping', eta: '8-10 days', slabs: [{ min: 0, max: 49900, charge: 9900, codAllowed: false }, { min: 49900, max: null, charge: 0 }], blockedPincodes: ['781001'] }] },
        { name: 'Rest of India', states: [], rates: [{ name: 'Standard', slabs: [{ min: 0, max: null, charge: 0 }] }] },
      ],
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().warnings[0]).toMatch(/called free but charges money/);
    expect(ok.json().shipping.zones[0].rates[0]).toMatchObject({ eta: '8-10 days', blockedPincodes: ['781001'] });
    expect(await prisma.shippingRate.count()).toBe(2);
  });
});

describe('Orders', () => {
  async function placeCodOrder() {
    await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
    const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2001', quantity: 2 }] } });
    const auth = { authorization: `Bearer ${start.json().token}` };
    const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: '9876543210' } });
    const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: '9876543210', code: otpOutbox.outbox.get('+919876543210') } });
    const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
    const st = (await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } })).json().state;
    const cod = st.methods.find((m: { method: string }) => m.method === 'cod');
    const paid = await app.inject({ method: 'POST', url: '/checkout/api/pay', headers: h, payload: { method: 'cod', expectedTotal: cod.total } });
    expect(paid.statusCode, paid.body).toBe(200);
  }

  it('lists, searches and opens orders of this store only', async () => {
    await placeCodOrder();
    const list = await call('GET', '/orders');
    expect(list.json().orders).toHaveLength(1);
    expect(list.json().orders[0]).toMatchObject({ number: 'CK1001', paymentMode: 'COD', total: 15400 });
    expect((await call('GET', '/orders?q=6543')).json().orders).toHaveLength(1);
    expect((await call('GET', '/orders?q=nobody')).json().orders).toHaveLength(0);
    const detail = await call('GET', `/orders/${list.json().orders[0].id}`);
    expect(detail.json().order.lines[0]).toMatchObject({ variantId: '2001', quantity: 2 });
    expect(detail.json().order.usageCharge).toMatchObject({ amount: 154, rateBps: 100 });

    const stranger = await signup(app, 'other@example.com');
    expect((await call('GET', `/orders/${list.json().orders[0].id}`, undefined, stranger)).statusCode).toBe(404);
  });
});
