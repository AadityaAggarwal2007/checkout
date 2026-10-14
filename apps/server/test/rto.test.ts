import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { keyring, makeApp, otpOutbox, prisma, resetDb, signup } from './helpers.js';

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
  const seeded = await seedDemo(prisma);
  storeId = seeded.storeId;
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true, partialCodEnabled: true, partialCodType: 'fixed', partialCodValue: 5000 } });
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
  otpOutbox.outbox.clear();
});

const dash = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

let phoneSeq = 0;
async function checkoutState(pincode = '302001', state = 'Rajasthan'): Promise<CheckoutState> {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2021', quantity: 1 }] } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const number = `97${String(76500000 + ++phoneSeq)}`;
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
  const res = await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state, pincode } } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().state;
}
const methods = (s: CheckoutState) => s.methods.map((m) => m.method);

describe('RTO suite', () => {
  it('a pincode rule hides COD and partial COD in the checkout; turning it off brings COD back', async () => {
    expect(methods(await checkoutState())).toContain('cod');
    const res = await dash('POST', '/rto/rules', { name: 'Risky Jaipur pins', condition: { kind: 'pincode', mode: 'list', pincodes: ['302001'] }, blockCod: true, blockPartialCod: true });
    expect(res.statusCode, res.body).toBe(200);
    const rule = res.json().rule;
    expect(rule.text).toBe('When the pincode is one of 1 listed');

    const blocked = await checkoutState();
    expect(methods(blocked)).not.toContain('cod');
    expect(methods(blocked)).not.toContain('partial_cod');
    expect(methods(blocked)).toContain('upi');
    expect(methods(await checkoutState('110001', 'Delhi'))).toContain('cod'); // another pincode is fine

    await dash('PATCH', `/rto/rules/${rule.id}`, { active: false });
    expect(methods(await checkoutState())).toContain('cod');
    expect(await prisma.activityLog.count({ where: { storeId, action: { startsWith: 'rto.' } } })).toBe(2);
  });

  it('checks the rule and keeps it per store; viewers only read', async () => {
    expect((await dash('POST', '/rto/rules', { name: 'x', condition: { kind: 'cart_amount' } })).statusCode).toBe(400);
    expect((await dash('POST', '/rto/rules', { name: 'x', condition: { kind: 'cart_amount', min: 50000, max: 100 } })).json().message).toContain('maximum');
    expect((await dash('POST', '/rto/rules', { name: 'x', condition: { kind: 'user', phones: ['12345'] } })).json().message).toContain('not a valid mobile');
    expect((await dash('POST', '/rto/rules', { name: 'x', condition: { kind: 'state', mode: 'list', states: ['Atlantis'] } })).statusCode).toBe(400);

    const ok = await dash('POST', '/rto/rules', { name: 'Big carts prepaid only', condition: { kind: 'cart_amount', max: 300000 } });
    expect(ok.json().rule).toMatchObject({ blockCod: true, blockPartialCod: false, text: 'When the cart amount is above ₹3,000' });
    const id = ok.json().rule.id as string;
    expect((await dash('PUT', '/rto/settings', { mode: 'single' })).json().mode).toBe('single');
    expect((await dash('GET', '/rto')).json()).toMatchObject({ mode: 'single', rules: [{ id }] });

    const viewer = await signup(app, 'viewer@example.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer@example.com' } });
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: 'VIEWER' } });
    expect((await dash('GET', '/rto', undefined, viewer)).statusCode).toBe(200);
    expect((await dash('DELETE', `/rto/rules/${id}`, undefined, viewer)).statusCode).toBe(403);
    const stranger = await signup(app, 'other@example.com');
    expect((await dash('GET', '/rto', undefined, stranger)).statusCode).toBe(404);
    expect((await dash('DELETE', `/rto/rules/${id}`)).statusCode).toBe(200);
    expect((await dash('GET', '/rto')).json().rules).toEqual([]);
  });
});
