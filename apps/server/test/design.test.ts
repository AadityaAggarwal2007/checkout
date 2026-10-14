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
  await prisma.storeSettings.update({ where: { storeId }, data: { checkoutEnabled: true } });
  await prisma.gatewayAccount.create({ data: { storeId, provider: 'DEV', active: true, credentialsEnc: keyring.encryptJson({}) } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
  otpOutbox.outbox.clear();
});

const dash = (method: 'GET' | 'PUT', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

async function startCheckout() {
  const start = await app.inject({ method: 'POST', url: `/storefront/checkout?key=${DEMO.widgetKey}`, payload: { lines: [{ variantId: '2021', quantity: 1 }] } });
  const auth = { authorization: `Bearer ${start.json().token}` };
  const state = (await app.inject({ method: 'GET', url: '/checkout/api/session', headers: auth })).json().state as CheckoutState;
  return { auth, state };
}

describe('checkout design', () => {
  it('saves the design and the checkout shows it: banners, method names / order / hiding, exit popup', async () => {
    const got = (await dash('GET', '/checkout-design')).json();
    expect(got.settings.exit).toMatchObject({ mode: 'savings' });
    expect(got.settings.trustBadges).toBe(true);
    const settings = {
      ...got.settings,
      colors: { primary: '#7C3AED', primaryText: '#FFFFFF', accent: '#059669' },
      banners: { login: 'Free delivery on prepaid orders' },
      methodLabels: { upi: 'UPI (fastest)' },
      methodOrder: ['cod', 'upi', 'card', 'netbanking', 'wallet', 'emi', 'pay_later', 'partial_cod'],
      hiddenMethods: ['card'],
      exit: { ...got.settings.exit, mode: 'survey', reasons: ['Too costly', 'Later'] },
    };
    const saved = await dash('PUT', '/checkout-design', settings);
    expect(saved.statusCode, saved.body).toBe(200);

    const { state } = await startCheckout();
    expect(state.store.colors.primary).toBe('#7C3AED');
    expect(state.settings).toMatchObject({ banners: { login: 'Free delivery on prepaid orders' }, methodLabels: { upi: 'UPI (fastest)' }, exit: { mode: 'survey', reasons: ['Too costly', 'Later'] } });

    expect((await dash('PUT', '/checkout-design', { ...settings, logoUrl: 'http://not-secure.example/logo.png' })).json().message).toContain('logoUrl');
    expect((await dash('PUT', '/checkout-design', { ...settings, methodOrder: ['upi', 'upi'] })).statusCode).toBe(400);
    expect(await prisma.activityLog.count({ where: { storeId, action: 'checkout.design' } })).toBe(1);
  });

  it('the exit survey keeps one answer per checkout and only the store’s reasons; viewers cannot change the design', async () => {
    const { auth } = await startCheckout();
    expect((await app.inject({ method: 'POST', url: '/checkout/api/exit', headers: auth, payload: { reason: 'Made up' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/checkout/api/exit', headers: auth, payload: { reason: 'Will order later' } })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/checkout/api/exit', headers: auth, payload: { reason: 'Something else' } });
    expect(await prisma.exitSurveyResponse.count({ where: { storeId } })).toBe(1);
    expect((await dash('GET', '/checkout-design')).json().exitAnswers).toEqual([{ reason: 'Will order later', count: 1 }]);

    const viewer = await signup(app, 'viewer@example.com');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer@example.com' } });
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: 'VIEWER' } });
    expect((await dash('PUT', '/checkout-design', {}, viewer)).statusCode).toBe(403);
  });

  it('serves the preview page for the dashboard only (no outside framing)', async () => {
    const res = await app.inject({ method: 'GET', url: '/checkout/preview' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(res.body).toContain('data-preview');
  });
});
