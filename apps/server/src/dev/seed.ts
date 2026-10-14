import type { Coupon } from '@checkout/core';
import { drawerSettingsSchema } from '@checkout/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/crypto.js';
import { toCouponRow } from '../rules/coupons.js';
import { ensureStoreDefaults } from '../rules/defaults.js';

/**
 * Demo data for local development (and tests): one merchant, one store that looks like kurtiya
 * (B1G1 on jhumkas, prepaid 5%, free-gift tiers, ₹30 shipping under ₹199). Never run in production.
 */
export const DEMO = {
  email: 'owner@local.test',
  password: 'local-password',
  shopDomain: 'kurtiya-dev.myshopify.com',
  widgetKey: 'dev-widget-key',
};

export async function seedDemo(prisma: PrismaClient): Promise<{ storeId: string; userId: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO.email },
    create: { email: DEMO.email, name: 'Local Owner', passwordHash: await hashPassword(DEMO.password) },
    update: {},
  });
  const store = await prisma.store.upsert({
    where: { shopDomain: DEMO.shopDomain },
    create: { shopDomain: DEMO.shopDomain, name: 'Kurtiya (local)', domain: 'localhost:5004', status: 'ACTIVE', widgetKey: DEMO.widgetKey },
    update: {},
  });
  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    create: { storeId: store.id, userId: user.id, role: 'OWNER' },
    update: {},
  });
  await prisma.$transaction(async (tx) => ensureStoreDefaults(tx, store.id));

  const drawer = drawerSettingsSchema.parse({
    announcements: { messages: ['Free shipping on orders above ₹199', 'Fast delivery in 6-7 days', 'Buy 1 Get 1 Free'] },
    rewardBar: {
      enabled: true,
      tiers: [
        { id: 'ship', label: 'Free shipping', threshold: 19900, kind: 'shipping' },
        { id: 'g299', label: "Free gift", threshold: 29900, kind: 'gift' },
        { id: 'g499', label: "Free gift", threshold: 49900, kind: 'gift' },
        { id: 'g599', label: "Free gift", threshold: 59900, kind: 'gift' },
      ],
    },
    upsells: { enabled: true, productIds: ['1004', '1005', '1006', '1002'] },
    notes: { enabled: true },
    confirmation: { enabled: true },
  });
  await prisma.drawerConfig.updateMany({ where: { storeId: store.id, isActive: true }, data: { config: drawer as Prisma.InputJsonValue } });

  const existing = await prisma.coupon.count({ where: { storeId: store.id } });
  if (existing === 0) {
    const base = { active: true, condition: {}, eligibility: {}, limits: { combinable: true } };
    const coupons: Coupon[] = [
      { ...base, id: '', kind: 'buy_x_get_y', code: 'B1G1', automatic: true, title: 'Buy 1 Get 1 Free', buy: { quantity: 1, scope: { collectionIds: ['9001'] } }, get: { quantity: 1, scope: { collectionIds: ['9001'] }, percentOff: 100 } },
      { ...base, id: '', kind: 'amount_off', code: 'PREPAID', automatic: true, title: 'Extra 5% off on prepaid', target: 'order', value: { type: 'percent', percent: 5 }, limits: { combinable: true, disableCod: true, disablePartialCod: true } },
      ...[
        ['FREEGIFT299', 29900, '1009', 'Men Set of 4 Eau De Parfum 20 ml', 4900],
        ['FREEGIFT499', 49900, '1008', 'Large Apfra Quilted Shoulder Bag', 39900],
        ['FREEGIFT599', 59900, '1007', 'Saint Laurent For Womens', 49900],
      ].map(([code, min, pid, title, price]) => ({
        ...base,
        id: '',
        kind: 'free_gift' as const,
        code: code as string,
        automatic: true,
        title: `Free gift on ₹${(min as number) / 100}+`,
        condition: { minSubtotal: min as number },
        gifts: [{ productId: pid as string, variantId: String(Number(pid) + 1054), title: title as string, unitPrice: price as number, quantity: 1 }],
      })),
    ];
    for (const c of coupons) await prisma.coupon.create({ data: toCouponRow(store.id, c) });
  }

  if ((await prisma.shippingZone.count({ where: { storeId: store.id } })) === 0) {
    await prisma.shippingZone.create({
      data: {
        storeId: store.id,
        name: 'India',
        rates: {
          create: {
            name: 'Standard',
            eta: '6-7 days',
            basis: 'PRICE',
            slabs: { create: [{ min: 0, max: 19900, charge: 3000, codAllowed: true }, { min: 19900, charge: 0, codAllowed: true }] },
          },
        },
      },
    });
  }
  return { storeId: store.id, userId: user.id };
}
