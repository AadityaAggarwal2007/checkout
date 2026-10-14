import { readFileSync } from 'node:fs';
import type { Catalog, CatalogProduct, CatalogVariant } from './types.js';

/**
 * Local development catalog (no Shopify needed): products come from a JSON file that the
 * local test store (apps/devstore) also serves, so prices match on both sides.
 */
export class DevCatalog implements Catalog {
  private readonly products_: CatalogProduct[];

  constructor(file: string) {
    this.products_ = (JSON.parse(readFileSync(file, 'utf8')) as { products: CatalogProduct[] }).products;
  }

  async variants(_storeId: string, ids: string[]): Promise<Map<string, CatalogVariant>> {
    const out = new Map<string, CatalogVariant>();
    for (const p of this.products_) for (const v of p.variants) if (ids.includes(v.variantId)) out.set(v.variantId, v);
    return out;
  }

  async products(_storeId: string, ids: string[]): Promise<CatalogProduct[]> {
    return ids.map((id) => this.products_.find((p) => p.productId === id)).filter((p): p is CatalogProduct => !!p);
  }
}
