import { readFileSync } from 'node:fs';
import type { Catalog, CatalogCollection, CatalogProduct, CatalogVariant } from './types.js';

/**
 * Local development catalog (no Shopify needed): products come from a JSON file that the
 * local test store (apps/devstore) also serves, so prices match on both sides.
 */
export class DevCatalog implements Catalog {
  private readonly products_: CatalogProduct[];
  private readonly collections_: CatalogCollection[];

  constructor(file: string, imageBase = 'http://localhost:5004') {
    const abs = (u?: string) => (u && u.startsWith('/') ? `${imageBase}${u}` : u);
    const data = JSON.parse(readFileSync(file, 'utf8')) as { products: CatalogProduct[]; collections?: CatalogCollection[] };
    this.collections_ = data.collections ?? [];
    this.products_ = data.products.map((p) => ({
      ...p,
      image: abs(p.image),
      variants: p.variants.map((v) => ({ ...v, image: abs(v.image) })),
    }));
  }

  async variants(_storeId: string, ids: string[]): Promise<Map<string, CatalogVariant>> {
    const out = new Map<string, CatalogVariant>();
    for (const p of this.products_) for (const v of p.variants) if (ids.includes(v.variantId)) out.set(v.variantId, v);
    return out;
  }

  async search(_storeId: string, query: string): Promise<CatalogProduct[]> {
    const q = query.trim().toLowerCase();
    return this.products_.filter((p) => !q || p.title.toLowerCase().includes(q)).slice(0, 20);
  }

  async collections(_storeId: string, opts: { query?: string; ids?: string[] }): Promise<CatalogCollection[]> {
    if (opts.ids) return opts.ids.map((id) => this.collections_.find((c) => c.collectionId === id)).filter((c): c is CatalogCollection => !!c);
    const q = (opts.query ?? '').trim().toLowerCase();
    return this.collections_.filter((c) => !q || c.title.toLowerCase().includes(q)).slice(0, 20);
  }

  async products(_storeId: string, ids: string[]): Promise<CatalogProduct[]> {
    return ids.map((id) => this.products_.find((p) => p.productId === id)).filter((p): p is CatalogProduct => !!p);
  }
}
