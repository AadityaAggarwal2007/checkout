import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { makeApp, prisma, resetDb } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  await seedDemo(prisma);
});

const price = (lines: Array<{ variantId: string; quantity: number }>, codes: string[] = []) =>
  app.inject({
    method: 'POST',
    url: `/storefront/price?key=${DEMO.widgetKey}`,
    headers: { origin: 'https://www.kurtiya.shop' },
    payload: { lines: lines.map((l, i) => ({ lineId: `line-${i}`, ...l })), codes },
  });

describe('storefront config', () => {
  it('serves the active drawer and visible codes to any origin', async () => {
    const res = await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}`, headers: { origin: 'https://www.kurtiya.shop' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const body = res.json();
    expect(body.drawer.announcements.messages[0]).toBe('Free shipping on orders above ₹199');
    expect(body.visibleCodes.map((c: { code: string }) => c.code)).toEqual(
      expect.arrayContaining(['B1G1', 'PREPAID', 'FREEGIFT299', 'FREEGIFT499', 'FREEGIFT599']),
    );
  });

  it('finds the store by its myshopify domain (theme app embed)', async () => {
    const res = await app.inject({ method: 'GET', url: `/storefront/config?shop=${DEMO.shopDomain}` });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/storefront/config?shop=evil.com' })).statusCode).toBe(400);
  });

  it('answers 404 for an unknown key and the preflight for POST', async () => {
    expect((await app.inject({ method: 'GET', url: '/storefront/config?key=nope' })).statusCode).toBe(404);
    const pre = await app.inject({ method: 'OPTIONS', url: `/storefront/price?key=${DEMO.widgetKey}`, headers: { origin: 'https://x.test', 'access-control-request-method': 'POST' } });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('storefront price (kurtiya rules)', () => {
  it('B1G1 on two jhumka packs + prepaid 5% + the ₹299 gift tier', async () => {
    const res = await price([{ variantId: '2001', quantity: 2 }]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.subtotal).toBe(24800);
    // one pack free (12400), then 5% of the remaining 12400 = 620
    expect(body.discount).toBe(12400 + 620);
    expect(body.lines[0].freeUnits).toBe(1);
    expect(Object.values(body.groups)).toEqual(['B1G1 applied!']);
    expect(body.gifts).toEqual([]); // subtotal 248 < 299: no gift yet
  });

  it('takes prices from the catalog, never from the browser, and skips unknown variants', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/storefront/price?key=${DEMO.widgetKey}`,
      payload: { lines: [{ lineId: 'a', variantId: '2021', quantity: 1, unitPrice: 1 }, { lineId: 'b', variantId: '999999', quantity: 1 }] },
    });
    const body = res.json();
    expect(body.lines).toHaveLength(1);
    expect(body.subtotal).toBe(49900);
    expect(body.gifts.map((g: { title: string }) => g.title)).toEqual(['Men Set of 4 Eau De Parfum 20 ml', 'Large Apfra Quilted Shoulder Bag']);
  });

  it('reports a bad code with a reason', async () => {
    const body = (await price([{ variantId: '2031', quantity: 1 }], ['SAVE50'])).json();
    expect(body.rejected).toEqual([{ code: 'SAVE50', message: 'This code is not valid.' }]);
  });

  it('refuses malformed input', async () => {
    const res = await app.inject({ method: 'POST', url: `/storefront/price?key=${DEMO.widgetKey}`, payload: { lines: [{ lineId: 'x', variantId: 'abc', quantity: 1 }] } });
    expect(res.statusCode).toBe(400);
  });
});

describe('drawer settings API', () => {
  async function login() {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: DEMO.email, password: DEMO.password } });
    return String(res.headers['set-cookie']).split(';')[0]!.replace('ck_session=', '');
  }

  it('saves a valid change, bumps the version, and the storefront sees it', async () => {
    const cookie = await login();
    const store = await prisma.store.findUniqueOrThrow({ where: { widgetKey: DEMO.widgetKey } });
    const list = (await app.inject({ method: 'GET', url: `/api/stores/${store.id}/drawers`, cookies: { ck_session: cookie } })).json();
    const drawer = list.drawers[0];
    const full = (await app.inject({ method: 'GET', url: `/api/stores/${store.id}/drawers/${drawer.id}`, cookies: { ck_session: cookie } })).json().drawer;
    full.config.announcements.messages = ['Diwali sale is live'];
    const saved = await app.inject({ method: 'PUT', url: `/api/stores/${store.id}/drawers/${drawer.id}`, cookies: { ck_session: cookie }, payload: { config: full.config } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().drawer.version).toBe(drawer.version + 1);
    const cfg = (await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}` })).json();
    expect(cfg.drawer.announcements.messages).toEqual(['Diwali sale is live']);
    expect(await prisma.activityLog.count({ where: { storeId: store.id, action: 'drawer.update' } })).toBe(1);
  });

  it('rejects an invalid config with a readable message', async () => {
    const cookie = await login();
    const store = await prisma.store.findUniqueOrThrow({ where: { widgetKey: DEMO.widgetKey } });
    const drawer = (await app.inject({ method: 'GET', url: `/api/stores/${store.id}/drawers`, cookies: { ck_session: cookie } })).json().drawers[0];
    const res = await app.inject({ method: 'PUT', url: `/api/stores/${store.id}/drawers/${drawer.id}`, cookies: { ck_session: cookie }, payload: { config: { colors: { primary: 'red' } } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('colors › primary');
  });

  it('keeps exactly one active drawer and will not delete it', async () => {
    const cookie = await login();
    const store = await prisma.store.findUniqueOrThrow({ where: { widgetKey: DEMO.widgetKey } });
    const base = `/api/stores/${store.id}/drawers`;
    const first = (await app.inject({ method: 'GET', url: base, cookies: { ck_session: cookie } })).json().drawers[0];
    const created = (await app.inject({ method: 'POST', url: base, cookies: { ck_session: cookie }, payload: { name: 'Diwali', copyFromId: first.id } })).json().drawer;
    expect((await app.inject({ method: 'DELETE', url: `${base}/${first.id}`, cookies: { ck_session: cookie } })).statusCode).toBe(409);
    await app.inject({ method: 'POST', url: `${base}/${created.id}/activate`, cookies: { ck_session: cookie }, payload: {} });
    const drawers = (await app.inject({ method: 'GET', url: base, cookies: { ck_session: cookie } })).json().drawers;
    expect(drawers.filter((d: { isActive: boolean }) => d.isActive).map((d: { name: string }) => d.name)).toEqual(['Diwali']);
    expect((await app.inject({ method: 'DELETE', url: `${base}/${first.id}`, cookies: { ck_session: cookie } })).statusCode).toBe(200);
  });
});
