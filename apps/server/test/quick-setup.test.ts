import { drawerSettingsSchema } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../src/dev/seed.js';
import { makeApp, prisma, resetDb } from './helpers.js';

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

describe('one-click Shiprocket look', () => {
  it('sets colours, timer, strip and button on the drawer and the checkout colours, keeping offers', async () => {
    const before = drawerSettingsSchema.parse((await prisma.drawerConfig.findFirstOrThrow({ where: { storeId, isActive: true } })).config);
    await prisma.drawerConfig.updateMany({ where: { storeId, isActive: true }, data: { config: { ...before, timer: { enabled: false } } } });
    const res = await app.inject({ method: 'POST', url: `/api/stores/${storeId}/quick-setup/shiprocket-look`, headers: { cookie: `ck_session=${cookie}` }, payload: {} });
    expect(res.statusCode).toBe(200);
    const d = drawerSettingsSchema.parse((await prisma.drawerConfig.findFirstOrThrow({ where: { storeId, isActive: true } })).config);
    expect(d.colors.primary).toBe('#540812');
    expect(d.timer.enabled).toBe(true);
    expect(d.announcements.mode).toBe('marquee');
    expect(d.settings).toMatchObject({ checkoutText: 'Buy Now', buttonTag: 'Limited Offer' });
    expect(d.rewardBar).toEqual(before.rewardBar); // offers untouched
    const checkout = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/checkout-design`, headers: { cookie: `ck_session=${cookie}` } });
    expect(checkout.json().settings.colors.primary).toBe('#540812');
  });

  it('needs a login', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/stores/${storeId}/quick-setup/shiprocket-look`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
