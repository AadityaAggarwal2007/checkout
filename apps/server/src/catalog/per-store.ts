import type { PrismaClient } from '@prisma/client';
import type { Catalog, CatalogCollection, CatalogProduct, CatalogVariant } from './types.js';

/**
 * Demo server with a real store too: a store connected to Shopify reads Shopify, every other store
 * (the demo store) reads the local catalog. Which one is looked up per store and kept for 30 seconds.
 */
export class ConnectedStores {
  private cache = new Map<string, { at: number; connected: boolean }>();
  constructor(private readonly prisma: PrismaClient) {}

  async connected(storeId: string): Promise<boolean> {
    const hit = this.cache.get(storeId);
    if (hit && Date.now() - hit.at < 30_000) return hit.connected;
    const conn = await this.prisma.shopifyConnection.findUnique({ where: { storeId }, select: { accessTokenEnc: true, uninstalledAt: true } });
    const connected = !!conn?.accessTokenEnc && !conn.uninstalledAt;
    this.cache.set(storeId, { at: Date.now(), connected });
    return connected;
  }
}

export class PerStoreCatalog implements Catalog {
  constructor(
    private readonly stores: ConnectedStores,
    private readonly local: Catalog,
    private readonly shopify: Catalog,
  ) {}

  private async pick(storeId: string): Promise<Catalog> {
    return (await this.stores.connected(storeId)) ? this.shopify : this.local;
  }
  async variants(storeId: string, variantIds: string[], fresh?: boolean): Promise<Map<string, CatalogVariant>> {
    return (await this.pick(storeId)).variants(storeId, variantIds, fresh);
  }
  async products(storeId: string, productIds: string[]): Promise<CatalogProduct[]> {
    return (await this.pick(storeId)).products(storeId, productIds);
  }
  async search(storeId: string, query: string): Promise<CatalogProduct[]> {
    return (await this.pick(storeId)).search(storeId, query);
  }
  async collections(storeId: string, opts: { query?: string; ids?: string[] }): Promise<CatalogCollection[]> {
    return (await this.pick(storeId)).collections(storeId, opts);
  }
}
