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
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  // A session token signed directly: logging in for every test would hit the login rate limit.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
  otpOutbox.outbox.clear();
});

const dash = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

/** Only the coupons a test creates count (the seed's kurtiya coupons are switched off). */
async function onlyNew() {
  await prisma.coupon.updateMany({ where: { storeId }, data: { active: false } });
}

async function create(coupon: object) {
  const res = await dash('POST', '/coupons', coupon);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().coupon as { id: string };
}

describe('coupon API', () => {
  it('creates, edits, hides and deletes; codes stay unique; the type cannot change', async () => {
    const c = await create({ kind: 'amount_off', automatic: false, code: 'diwali10', target: 'order', value: { type: 'percent', percent: 10, maxDiscount: 20000 }, condition: { minSubtotal: 49900 } });
    const dup = await dash('POST', '/coupons', { kind: 'free_shipping', automatic: false, code: 'DIWALI10' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toContain('DIWALI10');

    const got = (await dash('GET', `/coupons/${c.id}`)).json().coupon;
    expect(got).toMatchObject({ code: 'DIWALI10', kind: 'amount_off', value: { percent: 10, maxDiscount: 20000 }, condition: { minSubtotal: 49900 }, visible: true });
    const edited = await dash('PUT', `/coupons/${c.id}`, { ...got, title: 'Diwali special', details: ['Only this week'] });
    expect(edited.json().coupon).toMatchObject({ title: 'Diwali special', details: ['Only this week'] });
    expect((await dash('PUT', `/coupons/${c.id}`, { ...got, kind: 'free_shipping' })).statusCode).toBe(400);

    const list = (await dash('GET', '/coupons')).json().coupons;
    const row = list.find((r: { id: string }) => r.id === c.id);
    expect(row).toMatchObject({ headline: 'Flat 10% off (up to ₹200) on total value', active: true, stats: { orders: 0 } });

    await dash('PATCH', `/coupons/${c.id}`, { visible: false });
    const cfg = (await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}` })).json();
    expect(cfg.visibleCodes.map((v: { code: string }) => v.code)).not.toContain('DIWALI10');

    expect((await dash('DELETE', `/coupons/${c.id}`)).statusCode).toBe(200);
    expect((await dash('GET', `/coupons/${c.id}`)).statusCode).toBe(404);
    await create({ kind: 'free_shipping', automatic: false, code: 'DIWALI10' }); // code free again
    expect(await prisma.activityLog.count({ where: { storeId, action: { startsWith: 'coupon.' } } })).toBe(5);
  });

  it('reads free-gift names and prices from the catalog, not the browser', async () => {
    const res = await dash('POST', '/coupons', { kind: 'free_gift', automatic: true, gifts: [{ variantId: '2081', quantity: 1, title: 'FAKE', unitPrice: 1 }], condition: { minSubtotal: 29900 } });
    const gift = res.json().coupon.gifts[0];
    expect(gift.title).toContain('Eau De Parfum');
    expect(gift.unitPrice).toBe(4900);
    expect((await dash('POST', '/coupons', { kind: 'free_gift', automatic: true, gifts: [{ variantId: '999999' }] })).json().error).toBe('unknown_gift');
  });

  it('keeps payment offers on their own list and shows shoppers the rule text', async () => {
    await create({ kind: 'payment_offer', automatic: true, code: 'UPI10', methods: { upi: { type: 'percent', percent: 10 } } });
    const coupons = (await dash('GET', '/coupons')).json().coupons;
    const offers = (await dash('GET', '/coupons?kind=payment_offer')).json().coupons;
    expect(coupons.some((c: { code: string }) => c.code === 'UPI10')).toBe(false);
    expect(offers.map((c: { headline: string }) => c.headline)).toEqual(['Extra 10% off on UPI']);
    const cfg = (await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}` })).json();
    const b1g1 = cfg.visibleCodes.find((v: { code: string }) => v.code === 'B1G1');
    expect(b1g1.title).toBe('Buy 1 Get 1 Free'); // the seed's own title
    expect(cfg.visibleCodes.find((v: { code: string }) => v.code === 'PREPAID').details).toContain('Valid on prepaid orders only');
  });

  it('bulk actions, and only owners / admins may change coupons', async () => {
    const a = await create({ kind: 'free_shipping', automatic: false, code: 'SHIPA' });
    const b = await create({ kind: 'free_shipping', automatic: false, code: 'SHIPB' });
    expect((await dash('POST', '/coupons/bulk', { ids: [a.id, b.id], action: 'deactivate' })).json().count).toBe(2);
    expect(await prisma.coupon.count({ where: { id: { in: [a.id, b.id] }, active: true } })).toBe(0);
    const viewer = await signup(app, 'viewer@example.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer@example.com' } });
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: 'VIEWER' } });
    expect((await dash('GET', '/coupons', undefined, viewer)).statusCode).toBe(200);
    expect((await dash('POST', '/coupons', { kind: 'free_shipping', automatic: true }, viewer)).statusCode).toBe(403);
    const stranger = await signup(app, 'other@example.com');
    expect((await dash('GET', `/coupons/${a.id}`, undefined, stranger)).statusCode).toBe(404);
  });

  it('lists collections for the picker', async () => {
    const res = await dash('GET', '/collections?q=kurti');
    expect(res.json().collections).toEqual([{ collectionId: '9002', title: 'Kurtis' }]);
    expect((await dash('GET', '/collections?ids=9001,9004')).json().collections).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ same totals everywhere

let phoneSeq = 0;

/** A verified shopper's checkout for these lines (codes typed in the drawer go along). */
async function checkout(lines: Array<{ variantId: string; quantity: number }>, codes: string[] = [], phone?: string) {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines, codes } });
  expect(start.statusCode, start.body).toBe(200);
  const auth = { authorization: `Bearer ${start.json().token}` };
  const number = phone ?? `98${String(76500000 + ++phoneSeq)}`;
  await prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
  const sent = await app.inject({ method: 'POST', url: '/checkout/api/otp/send', headers: auth, payload: { phone: number } });
  const ver = await app.inject({ method: 'POST', url: '/checkout/api/otp/verify', headers: auth, payload: { challengeId: sent.json().challengeId, phone: number, code: otpOutbox.outbox.get(`+91${number}`) } });
  const h = { ...auth, 'x-ck-device': ver.json().deviceToken };
  let state: CheckoutState = ver.json().state;
  if (state.step === 'address') {
    state = (await app.inject({ method: 'POST', url: '/checkout/api/address', headers: h, payload: { address: { name: 'Asha Verma', line1: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } } })).json().state;
  }
  return {
    state,
    async pay(method: string) {
      const m = state.methods.find((x) => x.method === method);
      expect(m, `${method} offered`).toBeDefined();
      const res = await app.inject({ method: 'POST', url: '/checkout/api/pay', headers: h, payload: { method, expectedTotal: m!.total } });
      expect(res.statusCode, res.body).toBe(200);
      if (res.json().pay) {
        const ref = res.json().pay.ref as string;
        await app.inject({ method: 'GET', url: `/checkout/go/${ref}` });
        await app.inject({ method: 'POST', url: `/checkout/dev-gateway/${ref}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'result=success' });
        await app.inject({ method: 'GET', url: `/checkout/return/${ref}` });
      }
      return prisma.order.findFirstOrThrow({ where: { sessionId: state.id }, include: { lines: true } });
    },
  };
}

async function drawerTotal(lines: Array<{ variantId: string; quantity: number }>, codes: string[] = []) {
  const res = await app.inject({ method: 'POST', url: `/storefront/price?key=${DEMO.widgetKey}`, payload: { lines: lines.map((l, i) => ({ lineId: `l${i}`, ...l })), codes } });
  return res.json() as { total: number; discount: number; gifts: unknown[] };
}

/** The Shopify order adds up to our order total, and what is paid + due is that total. */
function expectShopifyMatches(order: Awaited<ReturnType<Awaited<ReturnType<typeof checkout>>['pay']>>) {
  const o = shopifyOrderInput(order).order;
  const toPaise = (s: string) => Math.round(Number(s) * 100);
  const items = o.lineItems.reduce((s, l) => s + toPaise((l.priceSet as { shopMoney: { amount: string } }).shopMoney.amount) * (l.quantity as number), 0);
  const discount = o.discountCode ? toPaise(o.discountCode.itemFixedDiscountCode.amountSet.shopMoney.amount) : 0;
  const shipping = toPaise(o.shippingLines[0]!.priceSet.shopMoney.amount);
  expect(items - discount + shipping).toBe(order.total);
  const tx = o.transactions.reduce((s, t) => s + toPaise((t.amountSet as { shopMoney: { amount: string } }).shopMoney.amount), 0);
  expect(tx).toBe(order.total);
}

describe('same totals in the drawer, the checkout and the Shopify order', () => {
  it('kurtiya rules: B1G1 + prepaid 5% + free-gift tier (UPI)', async () => {
    const lines = [{ variantId: '2001', quantity: 2 }, { variantId: '2021', quantity: 1 }];
    const drawer = await drawerTotal(lines);
    const c = await checkout(lines);
    expect(c.state.summary.subtotal - c.state.summary.discount).toBe(drawer.total);
    expect(c.state.lines.filter((l) => l.gift)).toHaveLength(drawer.gifts.length);
    const order = await c.pay('upi');
    expect(order.total).toBe(c.state.methods.find((m) => m.method === 'upi')!.total);
    expect(order.lines.filter((l) => l.isGift)).toHaveLength(drawer.gifts.length);
    expectShopifyMatches(order);
  });

  it('amount off a collection with a cap, typed in the drawer (COD)', async () => {
    await onlyNew();
    await create({ kind: 'amount_off', automatic: false, code: 'KURTI20', target: { scope: { collectionIds: ['9002'] } }, value: { type: 'percent', percent: 20, maxDiscount: 15000 } });
    const lines = [{ variantId: '2021', quantity: 2 }, { variantId: '2031', quantity: 1 }];
    const drawer = await drawerTotal(lines, ['KURTI20']);
    expect(drawer.discount).toBe(15000); // 20% of ₹998 = ₹199.60, capped at ₹150
    const c = await checkout(lines, ['KURTI20']);
    expect(c.state.summary.subtotal - c.state.summary.discount).toBe(drawer.total);
    const order = await c.pay('cod');
    expect(order.couponCodes).toEqual(['KURTI20']);
    expectShopifyMatches(order);
  });

  it('bundle: any 3 jhumkas for ₹299, free shipping code (card)', async () => {
    await onlyNew();
    await create({ kind: 'bundle', automatic: true, title: 'Any 3 for ₹299', scope: { collectionIds: ['9001'] }, bundleSize: 3, value: { type: 'bundle_price', price: 29900 } });
    await create({ kind: 'free_shipping', automatic: false, code: 'SHIPFREE' });
    const lines = [{ variantId: '2001', quantity: 2 }, { variantId: '2011', quantity: 2 }];
    const drawer = await drawerTotal(lines, ['SHIPFREE']);
    const c = await checkout(lines, ['SHIPFREE']);
    expect(c.state.summary.subtotal - c.state.summary.discount).toBe(drawer.total);
    expect(c.state.summary.shipping).toBe(0);
    expect(c.state.summary.shippingLabel).toBe('Free shipping');
    const order = await c.pay('card');
    expect(order.shipping).toBe(0);
    expectShopifyMatches(order);
  });

  it('payment offer: a different price per method, the chosen one is charged', async () => {
    await onlyNew();
    await create({ kind: 'payment_offer', automatic: true, code: 'PAYOFFER', methods: { upi: { type: 'percent', percent: 10 }, card: { type: 'fixed', amount: 2000 } } });
    const lines = [{ variantId: '2021', quantity: 1 }];
    const drawer = await drawerTotal(lines);
    expect(drawer.discount).toBe(0); // no method chosen in the drawer yet
    const c = await checkout(lines);
    const price = (m: string) => c.state.methods.find((x) => x.method === m)!.total;
    expect(price('netbanking') - price('upi')).toBe(4990);
    expect(price('netbanking') - price('card')).toBe(2000);
    expect(c.state.methods.find((m) => m.method === 'upi')!.extraSaving).toBe(4990);
    const order = await c.pay('upi');
    expect(order.total).toBe(price('upi'));
    expectShopifyMatches(order);
  });

  it('purchase driven + once per customer: only from the second order, only once', async () => {
    await onlyNew();
    await create({ kind: 'purchase_driven', automatic: false, code: 'COMEBACK', behaviour: { minOrders: 1 }, value: { type: 'fixed', amount: 5000 }, limits: { perShopper: 1, combinable: true } });
    const lines = [{ variantId: '2021', quantity: 1 }];
    const phone = '9123400001';
    const first = await checkout(lines, ['COMEBACK'], phone);
    expect(first.state.coupons.rejected[0]).toMatchObject({ code: 'COMEBACK' });
    await first.pay('cod');
    const second = await checkout(lines, ['COMEBACK'], phone);
    expect(second.state.coupons.applied.map((a) => a.code)).toEqual(['COMEBACK']);
    const order = await second.pay('cod');
    expect(order.discount).toBe(5000);
    expectShopifyMatches(order);
    const third = await checkout(lines, ['COMEBACK'], phone);
    expect(third.state.coupons.rejected[0]?.message).toBe('You have already used this code.');
    const stats = (await dash('GET', '/coupons')).json().coupons.find((r: { code: string }) => r.code === 'COMEBACK').stats;
    expect(stats).toMatchObject({ orders: 1, discount: 5000 });
  });

  it('a coupon that disables COD takes COD away while it applies', async () => {
    await onlyNew();
    await create({ kind: 'amount_off', automatic: true, title: 'Prepaid 10%', target: 'order', value: { type: 'percent', percent: 10 }, limits: { combinable: true, disableCod: true, disablePartialCod: true } });
    const c = await checkout([{ variantId: '2021', quantity: 1 }]);
    const cod = c.state.methods.find((m) => m.method === 'cod')!;
    const upi = c.state.methods.find((m) => m.method === 'upi')!;
    expect(cod.total - upi.total).toBe(4990); // COD pays without the prepaid discount
    const order = await c.pay('cod');
    expect(order.discount).toBe(0);
    expectShopifyMatches(order);
  });
});
