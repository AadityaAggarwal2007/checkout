import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cookieFrom, makeApp, prisma, resetDb, signup } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

describe('merchant login', () => {
  it('signs up, reads me, and rejects a wrong password', async () => {
    const cookie = await signup(app, 'Owner@Example.com');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { ck_session: cookie } });
    expect(me.json()).toMatchObject({ user: { email: 'owner@example.com' }, stores: [] });

    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'owner@example.com', password: 'nope-nope' } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'owner@example.com', password: 'correct horse' } });
    expect(good.statusCode).toBe(200);
    expect(cookieFrom(good, 'ck_session')).toBeTruthy();
  });

  it('does not allow the same email twice', async () => {
    await signup(app, 'a@example.com');
    const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'a@example.com', password: 'correct horse', name: 'x' } });
    expect(res.statusCode).toBe(409);
  });

  it('"sign out everywhere" kills older cookies', async () => {
    const old = await signup(app, 'b@example.com');
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout-everywhere', cookies: { ck_session: old }, payload: {} });
    expect(res.statusCode).toBe(200);
    const fresh = cookieFrom(res, 'ck_session')!;
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { ck_session: old } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { ck_session: fresh } })).statusCode).toBe(200);
  });

  it('refuses non-JSON writes (CSRF from forms)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=a@b.c&password=x',
    });
    expect(res.statusCode).toBe(415);
  });

  it('a merchant never sees another merchant\'s store', async () => {
    const a = await signup(app, 'a@example.com');
    const b = await signup(app, 'b@example.com');
    const userA = await prisma.user.findUniqueOrThrow({ where: { email: 'a@example.com' } });
    const store = await prisma.store.create({ data: { name: 'A', shopDomain: 'a.myshopify.com', members: { create: { userId: userA.id, role: 'OWNER' } } } });
    expect((await app.inject({ method: 'GET', url: `/api/stores/${store.id}`, cookies: { ck_session: a } })).statusCode).toBe(200);
    const asB = await app.inject({ method: 'GET', url: `/api/stores/${store.id}`, cookies: { ck_session: b } });
    expect(asB.statusCode).toBe(404);
  });
});
