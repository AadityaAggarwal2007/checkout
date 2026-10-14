import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { istDayStart } from '../src/routes/analytics.js';
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
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
  await prisma.coupon.updateMany({ where: { storeId }, data: { active: false } });
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
  otpOutbox.outbox.clear();
});

const dash = (url: string, as = cookie) => app.inject({ method: 'GET', url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` } });

let phoneSeq = 0;
/** Opens a checkout; `until` decides how far the shopper gets. */
async function shopper(until: 'opened' | 'verified' | 'address' | 'cod', utm?: string) {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2021', quantity: 1 }], attribution: utm ? { utm: { utm_source: utm } } : {} } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const id = (await app.inject({ method: 'GET', url: '/checkout/api/session', headers: auth })).json().state.id as string;
  if (until === 'opened') return id;
  const number = `95${String(76500000 + ++phoneSeq)}`;
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  if (until === 'verified') return id;
  const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
  const state = (await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } })).json().state as CheckoutState;
  if (until === 'address') return id;
  const cod = state.methods.find((m) => m.method === 'cod')!;
  expect((await app.inject({ method: 'POST', url: '/checkout/api/pay', headers: h, payload: { method: 'cod', expectedTotal: cod.total } })).statusCode).toBe(200);
  return id;
}

describe('dashboard home and abandoned checkouts', () => {
  it('counts sales, the funnel, payment modes and sources', async () => {
    await shopper('cod', 'instagram');
    await shopper('cod');
    await shopper('address');
    await shopper('verified');
    await shopper('opened');
    const a = (await dash('/analytics?days=7')).json();
    expect(a.orders).toBe(2);
    expect(a.sales).toBe(a.aov * 2);
    expect(a.funnel.map((f: { count: number }) => f.count)).toEqual([5, 4, 3, 2, 2]);
    expect(a.byMode).toEqual([{ mode: 'COD', orders: 2, sales: a.sales }]);
    expect(a.sources.map((s: { source: string }) => s.source).sort()).toEqual(['direct', 'instagram']);
    expect(a.byDay.reduce((s: number, d: { orders: number }) => s + d.orders, 0)).toBe(2);
    expect((await dash('/analytics?days=5')).statusCode).toBe(400);
  });

  it('lists abandoned checkouts 30 minutes after the last step, with the cart', async () => {
    const left = await shopper('address');
    await shopper('verified'); // still active: not listed yet
    await shopper('opened'); // no phone: never listed
    await shopper('cod'); // ordered: never listed
    await prisma.checkoutSession.update({ where: { id: left }, data: { updatedAt: new Date(Date.now() - 40 * 60_000) } });
    const list = (await dash('/abandoned?days=7')).json();
    expect(list.count).toBe(1);
    expect(list.checkouts[0]).toMatchObject({ id: left, name: 'Asha Verma', step: 'At payment', items: 1, value: 49900 });
    const detail = (await dash(`/abandoned/${left}`)).json().checkout;
    expect(detail.lines[0]).toMatchObject({ title: 'Cotton Straight Kurti', quantity: 1 });
    expect(detail.address).toMatchObject({ city: 'Jaipur', pincode: '302001' });
    const stranger = await signup(app, 'other@example.com');
    expect((await dash(`/abandoned/${left}`, stranger)).statusCode).toBe(404);
  });

  it('India day starts at 00:00 IST', () => {
    // 2026-10-14 03:00 IST = 2026-10-13 21:30 UTC → the day began 2026-10-13 18:30 UTC.
    expect(istDayStart(0, Date.UTC(2026, 9, 13, 21, 30)).toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(istDayStart(6, Date.UTC(2026, 9, 13, 21, 30)).toISOString()).toBe('2026-10-07T18:30:00.000Z');
  });
});
