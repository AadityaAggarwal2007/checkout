import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hmacBase64, hmacHex } from '../src/lib/crypto.js';
import { cookieFrom, env, makeApp, prisma, resetDb, signup } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const SHOP = 'kurtiya-test.myshopify.com';

function signed(params: Record<string, string>): string {
  const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return new URLSearchParams({ ...params, hmac: hmacHex(env.SHOPIFY_API_SECRET, msg) }).toString();
}

async function install(cookies: Record<string, string> = {}) {
  const start = await app.inject({ method: 'GET', url: `/shopify/install?${signed({ shop: SHOP, timestamp: '1700000000' })}` });
  expect(start.statusCode).toBe(302);
  const authorize = new URL(String(start.headers.location));
  expect(authorize.host).toBe(SHOP);
  expect(authorize.searchParams.get('redirect_uri')).toBe('https://api.test/shopify/callback');
  const state = authorize.searchParams.get('state')!;
  const nonce = cookieFrom(start, 'ck_oauth')!;
  return app.inject({
    method: 'GET',
    url: `/shopify/callback?${signed({ shop: SHOP, code: 'the-code', state, timestamp: '1700000001' })}`,
    cookies: { ck_oauth: nonce, ...cookies },
  });
}

describe('shopify install', () => {
  it('stores the token encrypted and hands a claim link to a logged-out merchant', async () => {
    const res = await install();
    expect(res.statusCode).toBe(302);
    const location = new URL(String(res.headers.location));
    expect(location.origin + location.pathname).toBe('https://dash.test/connect');

    const store = await prisma.store.findUniqueOrThrow({ where: { shopDomain: SHOP }, include: { shopify: true, settings: true } });
    expect(store.name).toBe('Kurtiya Store');
    expect(store.settings?.billingRateBps).toBe(100);
    expect(store.shopify!.accessTokenEnc).not.toContain('shpat');
    expect(app.deps.keyring.decrypt(store.shopify!.accessTokenEnc)).toBe('shpat_secret_token_value');

    const owner = await signup(app, 'owner@example.com');
    const claim = location.searchParams.get('claim')!;
    const ok = await app.inject({ method: 'POST', url: '/api/stores/claim', cookies: { ck_session: owner }, payload: { token: claim } });
    expect(ok.json()).toEqual({ storeId: store.id });

    const other = await signup(app, 'other@example.com');
    const stolen = await app.inject({ method: 'POST', url: '/api/stores/claim', cookies: { ck_session: other }, payload: { token: claim } });
    expect(stolen.statusCode).toBe(409);
  });

  it('links straight to a logged-in merchant', async () => {
    const owner = await signup(app, 'owner@example.com');
    const res = await install({ ck_session: owner });
    const store = await prisma.store.findUniqueOrThrow({ where: { shopDomain: SHOP } });
    expect(res.headers.location).toBe(`https://dash.test/stores/${store.id}`);
  });

  it('refuses a callback without the browser nonce or with a bad signature', async () => {
    const start = await app.inject({ method: 'GET', url: `/shopify/install?shop=${SHOP}` });
    const state = new URL(String(start.headers.location)).searchParams.get('state')!;
    const noCookie = await app.inject({ method: 'GET', url: `/shopify/callback?${signed({ shop: SHOP, code: 'c', state, timestamp: '1' })}` });
    expect(noCookie.statusCode).toBe(401);
    const badSig = await app.inject({ method: 'GET', url: `/shopify/callback?shop=${SHOP}&code=c&state=${state}&hmac=deadbeef` });
    expect(badSig.statusCode).toBe(401);
    expect(await prisma.store.count()).toBe(0);
  });

  it('rejects an install for a non-Shopify host', async () => {
    const res = await app.inject({ method: 'GET', url: '/shopify/install?shop=evil.com' });
    expect(res.statusCode).toBe(400);
  });
});

describe('shopify webhooks', () => {
  async function send(topic: string, body: object, id = 'wh-1', secret = env.SHOPIFY_API_SECRET) {
    const raw = JSON.stringify(body);
    return app.inject({
      method: 'POST',
      url: '/webhooks/shopify',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': hmacBase64(secret, raw),
        'x-shopify-topic': topic,
        'x-shopify-shop-domain': SHOP,
        'x-shopify-webhook-id': id,
      },
      payload: raw,
    });
  }

  it('rejects a forged webhook', async () => {
    expect((await send('app/uninstalled', {}, 'x', 'wrong-secret')).statusCode).toBe(401);
  });

  it('uninstall drops the token, once', async () => {
    await install();
    expect((await send('app/uninstalled', { id: 1 })).statusCode).toBe(200);
    const store = await prisma.store.findUniqueOrThrow({ where: { shopDomain: SHOP }, include: { shopify: true } });
    expect(store.status).toBe('UNINSTALLED');
    expect(store.shopify!.accessTokenEnc).toBe('');
    expect((await send('app/uninstalled', { id: 1 })).json()).toEqual({ ok: true, duplicate: true });
  });

  it('shop/redact erases the store', async () => {
    await install();
    await send('shop/redact', { shop_domain: SHOP }, 'wh-2');
    expect(await prisma.store.count()).toBe(0);
  });
});
