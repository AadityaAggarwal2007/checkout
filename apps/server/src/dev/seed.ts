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

/**
 * localCheckout: also switch our checkout on with the local test gateway (local runs and e2e only;
 * the test gateway works only on a server started with DEV_GATEWAY=1).
 */
export async function seedDemo(
  prisma: PrismaClient,
  opts: { localCheckout?: boolean; domain?: string; email?: string; password?: string } = {},
): Promise<{ storeId: string; userId: string }> {
  const domain = opts.domain ?? 'localhost:5004';
  // A demo on a public server gets its own login (deploy/install.sh), never the well-known local one.
  const email = opts.email ?? DEMO.email;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Demo Owner', passwordHash: await hashPassword(opts.password ?? DEMO.password) },
    update: {},
  });
  const store = await prisma.store.upsert({
    where: { shopDomain: DEMO.shopDomain },
    create: { shopDomain: DEMO.shopDomain, name: 'Kurtiya (local)', domain, status: 'ACTIVE', widgetKey: DEMO.widgetKey },
    update: { domain },
  });
  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    create: { storeId: store.id, userId: user.id, role: 'OWNER' },
    update: {},
  });
  await prisma.$transaction(async (tx) => ensureStoreDefaults(tx, store.id));

  const drawer = drawerSettingsSchema.parse({
    colors: { primary: '#540812', buttonText: '#FFFFFF', background: '#FFF7ED', accent: '#16A34A', highlight: '#AC6E0D' },
    timer: { enabled: true },
    settings: { buttonTag: 'Limited Offer' },
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
        ['FREEGIFT299', 29900, '1009', '2081', 'Men Set of 4 Eau De Parfum 20 ml', 4900],
        ['FREEGIFT499', 49900, '1008', '2071', 'Large Apfra Quilted Shoulder Bag', 39900],
        ['FREEGIFT599', 59900, '1007', '2061', 'Saint Laurent For Womens', 49900],
      ].map(([code, min, pid, vid, title, price]) => ({
        ...base,
        id: '',
        kind: 'free_gift' as const,
        code: code as string,
        automatic: true,
        title: `Free gift on ₹${(min as number) / 100}+`,
        condition: { minSubtotal: min as number },
        gifts: [{ productId: pid as string, variantId: vid as string, title: title as string, unitPrice: price as number, quantity: 1 }],
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
  if (opts.localCheckout) {
    await prisma.storeSettings.update({ where: { storeId: store.id }, data: { checkoutEnabled: true, partialCodEnabled: true, partialCodType: 'fixed', partialCodValue: 5000 } });
    await prisma.gatewayAccount.upsert({
      where: { storeId_provider: { storeId: store.id, provider: 'DEV' } },
      // The test gateway has no credentials.
      create: { storeId: store.id, provider: 'DEV', active: true, credentialsEnc: '' },
      update: { active: true },
    });
    // A demo upsell: jewellery boxes, 20% off for 10 minutes, offered with kurtis.
    if ((await prisma.upsellRule.count({ where: { storeId: store.id } })) === 0) {
      await prisma.upsellRule.create({
        data: {
          storeId: store.id,
          name: 'Boxes with kurtis',
          rule: { when: { kind: 'collections', collectionIds: ['9002'] }, productIds: ['1004', '1005'], audience: 'all', discountPercent: 20, timerMinutes: 10, title: 'Add a jewellery box', maxItems: 3 },
        },
      });
    }
  }
  return { storeId: store.id, userId: user.id };
}
