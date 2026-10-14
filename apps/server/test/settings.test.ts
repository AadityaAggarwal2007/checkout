import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO, seedDemo } from '../src/dev/seed.js';
import { makeApp, prisma, resetDb, signup } from './helpers.js';

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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: seeded.userId } });
  cookie = await app.deps.tokens.sign('session', { sub: user.id, tv: user.tokenVersion }, 3600);
});

const dash = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, as = cookie) =>
  app.inject({ method, url: `/api/stores/${storeId}${url}`, headers: { cookie: `ck_session=${as}` }, ...(payload ? { payload } : {}) });

async function asMember(email: string, role: 'ADMIN' | 'STAFF' | 'VIEWER') {
  const c = await signup(app, email);
  expect((await dash('POST', '/team', { email, role })).statusCode).toBe(200);
  return c;
}

describe('settings', () => {
  it('Meta Pixel: saved by admins, sent to the store page only when on', async () => {
    expect((await dash('PUT', '/integrations/meta-pixel', { enabled: true, pixelId: 'abc' })).statusCode).toBe(400);
    expect((await dash('PUT', '/integrations/meta-pixel', { enabled: true, pixelId: '' })).statusCode).toBe(400);
    expect((await dash('PUT', '/integrations/meta-pixel', { enabled: true, pixelId: '123456789012345' })).statusCode).toBe(200);
    const cfg = async () => (await app.inject({ method: 'GET', url: `/storefront/config?key=${DEMO.widgetKey}` })).json();
    expect((await cfg()).metaPixelId).toBe('123456789012345');
    await dash('PUT', '/integrations/meta-pixel', { enabled: false, pixelId: '123456789012345' });
    expect((await cfg()).metaPixelId).toBeUndefined();
    expect((await dash('GET', '/integrations')).json().metaPixel).toEqual({ enabled: false, pixelId: '123456789012345' });
  });

  it('team: only existing accounts, admins cannot touch admins, nobody changes themselves', async () => {
    expect((await dash('POST', '/team', { email: 'nobody@example.com', role: 'STAFF' })).json().message).toContain('sign up first');
    const admin = await asMember('admin@example.com', 'ADMIN');
    const staff = await asMember('staff@example.com', 'STAFF');
    expect((await dash('POST', '/team', { email: 'staff@example.com', role: 'VIEWER' })).statusCode).toBe(409);
    const members = (await dash('GET', '/team')).json().members as Array<{ id: string; email: string; role: string }>;
    const id = (e: string) => members.find((m) => m.email === e)!.id;
    expect((await dash('PATCH', `/team/${id('staff@example.com')}`, { role: 'VIEWER' }, admin)).statusCode).toBe(200);
    expect((await dash('PATCH', `/team/${id('staff@example.com')}`, { role: 'ADMIN' }, admin)).statusCode).toBe(403);
    expect((await dash('DELETE', `/team/${id('admin@example.com')}`, undefined, admin)).statusCode).toBe(400); // self
    expect((await dash('GET', '/team', undefined, staff)).statusCode).toBe(403); // now a viewer
    expect((await dash('DELETE', `/team/${id('admin@example.com')}`)).statusCode).toBe(200); // the owner can
    expect((await dash('GET', '/team', undefined, admin)).statusCode).toBe(404); // gone
    const log = (await dash('GET', '/activity')).json().items.map((i: { summary: string }) => i.summary);
    expect(log).toContain('Removed admin@example.com');
  });

  it('API keys: shown once, read orders, revoked keys stop working; only the owner makes keys', async () => {
    const made = (await dash('POST', '/api-keys', { name: 'ERP' })).json();
    expect(made.key).toMatch(/^ck_live_/);
    expect(made.keys[0]).toMatchObject({ name: 'ERP', prefix: made.key.slice(0, 12), revoked: false });
    expect(JSON.stringify((await dash('GET', '/api-keys')).json())).not.toContain(made.key);
    const v1 = (key: string) => app.inject({ method: 'GET', url: '/api/v1/orders', headers: { authorization: `Bearer ${key}` } });
    const res = await v1(made.key);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orders: [], nextCursor: null });
    expect((await v1('ck_live_wrong')).statusCode).toBe(401);
    await dash('DELETE', `/api-keys/${made.keys[0].id}`);
    expect((await v1(made.key)).statusCode).toBe(401);
    const admin = await asMember('admin2@example.com', 'ADMIN');
    expect((await dash('POST', '/api-keys', { name: 'x' }, admin)).statusCode).toBe(403);
  });
});
