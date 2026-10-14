import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConnectedStores, PerStoreCatalog } from '../src/catalog/per-store.js';
import type { Catalog } from '../src/catalog/types.js';
import { seedDemo } from '../src/dev/seed.js';
import { prisma, resetDb } from './helpers.js';

const fake = (name: string): Catalog => ({
  variants: async () => new Map([['1', { variantId: '1', productId: name, productTitle: name, title: '', price: 100, collectionIds: [], available: true }]]),
  products: async () => [],
  search: async () => [],
  collections: async () => [],
});

afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb());

describe('demo server with a real store', () => {
  it('a store connected to Shopify reads Shopify, the demo store the local catalog', async () => {
    const demo = (await seedDemo(prisma)).storeId;
    const real = await prisma.store.create({ data: { shopDomain: 'elvora.myshopify.com', name: 'Elvora' } });
    await prisma.shopifyConnection.create({ data: { storeId: real.id, accessTokenEnc: 'enc', scopes: 'read_products' } });
    const catalog = new PerStoreCatalog(new ConnectedStores(prisma), fake('local'), fake('shopify'));
    expect((await catalog.variants(demo, ['1'])).get('1')?.productId).toBe('local');
    expect((await catalog.variants(real.id, ['1'])).get('1')?.productId).toBe('shopify');
  });
});
