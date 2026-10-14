import type { CheckoutState } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { shopifyOrderInput } from '../src/orders/sink.js';
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
  await prisma.coupon.updateMany({ where: { storeId }, data: { active: false } }); // plain prices
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
  otpOutbox.outbox.clear();
});

const dash = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

let phoneSeq = 0;
async function checkout(variantId = '2021') {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId, quantity: 1 }] } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const number = `96${String(76500000 + ++phoneSeq)}`;
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
  const res = await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } });
  const state: CheckoutState = res.json().state;
  return {
    state,
    upsell: (payload: object) => app.inject({ method: 'POST', url: '/checkout/api/upsell', headers: h, payload }),
    pay: (s: CheckoutState, method = 'cod') => app.inject({ method: 'POST', url: '/checkout/api/pay', headers: h, payload: { method, expectedTotal: s.methods.find((m) => m.method === method)!.total } }),
  };
}

const KURTI_OFFER = { name: 'Boxes with kurtis', rule: { when: { kind: 'collections', collectionIds: ['9002'] }, productIds: ['1004', '1005'], discountPercent: 20, timerMinutes: 10, title: 'Add a jewellery box' } };

describe('upsell in the checkout', () => {
  it('shows the offer at server prices, adds it at the locked % off, and the order carries it', async () => {
    expect((await dash('POST', '/upsells', KURTI_OFFER)).json().upsell.text).toBe('Cart has items of 1 collection → 2 products, 20% off, 10 min timer');
    const c = await checkout();
    const offer = c.state.upsell!;
    expect(offer).toMatchObject({ title: 'Add a jewellery box', percent: 20 });
    expect(offer.items.map((i) => i.variants[0]!.offerPrice)).toEqual([6320, 4720]); // ₹79 and ₹59, 20% off
    expect(offer.endsAt! - Date.now()).toBeGreaterThan(9 * 60_000);

    const added = (await c.upsell({ variantId: '2031' })).json().state as CheckoutState;
    const line = added.lines.find((l) => l.variantId === '2031')!;
    expect(line).toMatchObject({ unitPrice: 6320, compareAtPrice: 7900, upsell: true });
    expect(added.upsell!.items.map((i) => i.productId)).toEqual(['1005']); // the added one is not offered again
    expect(added.summary.subtotal).toBe(49900 + 6320);
    expect((await c.upsell({ variantId: '2051' })).statusCode).toBe(400); // not in this offer

    const paid = await c.pay(added);
    expect(paid.statusCode, paid.body).toBe(200);
    const order = await prisma.order.findFirstOrThrow({ where: { sessionId: added.id }, include: { lines: true } });
    expect(order.lines.find((l) => l.variantId === '2031')?.unitPrice).toBe(6320);
    const shopify = shopifyOrderInput(order).order;
    expect(shopify.lineItems).toHaveLength(2);
  });

  it('the timer ends the offer; a removed item can go; other carts and audiences see nothing', async () => {
    await dash('POST', '/upsells', KURTI_OFFER);
    const c = await checkout();
    const added = (await c.upsell({ variantId: '2041' })).json().state as CheckoutState;
    const removed = (await c.upsell({ lineId: added.lines.find((l) => l.upsell)!.lineId })).json().state as CheckoutState;
    expect(removed.lines).toHaveLength(1);
    expect((await c.upsell({ lineId: removed.lines[0]!.lineId })).statusCode).toBe(404); // own cart lines stay

    // 11 minutes later the offer is gone and cannot be added.
    const s = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: c.state.id } });
    const upsell = s.upsell as { shown: Record<string, number> };
    for (const k of Object.keys(upsell.shown)) upsell.shown[k] = Date.now() - 11 * 60_000;
    await prisma.checkoutSession.update({ where: { id: s.id }, data: { upsell } });
    expect((await c.upsell({ variantId: '2031' })).json().error).toBe('offer_ended');

    expect((await checkout('2001')).state.upsell).toBeNull(); // jhumkas are not kurtis
    await dash('POST', '/upsells', { ...KURTI_OFFER, name: 'Repeat only', priority: 5, rule: { ...KURTI_OFFER.rule, audience: 'repeat', title: 'For you' } });
    expect((await checkout()).state.upsell?.title).toBe('Add a jewellery box'); // a new shopper skips the repeat-only rule
  });

  it('dashboard API: checks input, viewers read only', async () => {
    expect((await dash('POST', '/upsells', { name: 'x', rule: { when: { kind: 'any' }, productIds: [] } })).json().message).toContain('at least one product');
    expect((await dash('POST', '/upsells', { name: 'x', rule: { when: { kind: 'any' }, productIds: ['1004'], discountPercent: 95 } })).statusCode).toBe(400);
    const u = (await dash('POST', '/upsells', { name: 'Any cart', rule: { when: { kind: 'any' }, productIds: ['1004'] } })).json().upsell;
    expect(u.rule).toMatchObject({ audience: 'all', discountPercent: 0, timerMinutes: 0, maxItems: 3 });
    expect((await dash('PATCH', `/upsells/${u.id}`, { active: false })).json().upsell.active).toBe(false);
    const viewer = await signup(app, 'viewer@example.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer@example.com' } });
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: 'VIEWER' } });
    expect((await dash('GET', '/upsells', undefined, viewer)).json().upsells).toHaveLength(1);
    expect((await dash('DELETE', `/upsells/${u.id}`, undefined, viewer)).statusCode).toBe(403);
    expect((await dash('DELETE', `/upsells/${u.id}`)).statusCode).toBe(200);
  });
});
