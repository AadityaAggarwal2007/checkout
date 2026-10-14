import { rupeesToPaise } from '@checkout/core';
import type { PrismaClient } from '@prisma/client';
import type { Keyring } from '../lib/crypto.js';
import { gidToId, idToGid, type Catalog, type CatalogCollection, type CatalogProduct, type CatalogVariant } from './types.js';

const VARIANT_FIELDS = `
  id title sku price compareAtPrice availableForSale
  image { url }
  inventoryItem { measurement { weight { unit value } } }
  product { id title handle featuredImage { url } collections(first: 50) { nodes { id } } }`;

const TO_GRAMS: Record<string, number> = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.3495, POUNDS: 453.592 };

interface GqlVariant {
  id: string;
  title: string;
  sku?: string | null;
  price: string;
  compareAtPrice?: string | null;
  availableForSale: boolean;
  image?: { url: string } | null;
  inventoryItem?: { measurement?: { weight?: { unit: string; value: number } | null } | null } | null;
  product: { id: string; title: string; handle: string; featuredImage?: { url: string } | null; collections: { nodes: { id: string }[] } };
}

function toVariant(v: GqlVariant): CatalogVariant {
  const w = v.inventoryItem?.measurement?.weight;
  const compare = v.compareAtPrice ? rupeesToPaise(v.compareAtPrice) : undefined;
  const price = rupeesToPaise(v.price);
  return {
    variantId: gidToId(v.id),
    productId: gidToId(v.product.id),
    productTitle: v.product.title,
    title: v.title,
    image: v.image?.url ?? v.product.featuredImage?.url,
    price,
    compareAtPrice: compare && compare > price ? compare : undefined,
    collectionIds: v.product.collections.nodes.map((c) => gidToId(c.id)),
    weightGrams: w ? Math.round(w.value * (TO_GRAMS[w.unit] ?? 1)) : undefined,
    available: v.availableForSale,
    sku: v.sku ?? undefined,
  };
}

/**
 * Reads products from the store's Shopify Admin GraphQL API with a short in-memory cache
 * (prices are re-read at least every `ttlMs`; at payment time the checkout bypasses the cache).
 */
export class ShopifyCatalog implements Catalog {
  private cache = new Map<string, { at: number; value: CatalogVariant }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly keyring: Keyring,
    private readonly apiVersion: string,
    private readonly http: typeof fetch = fetch,
    private readonly ttlMs = 60_000,
  ) {}

  private async gql<T>(storeId: string, query: string, variables: object): Promise<T> {
    const conn = await this.prisma.shopifyConnection.findUnique({ where: { storeId }, include: { store: true } });
    if (!conn || !conn.accessTokenEnc) throw new Error('store is not connected to Shopify');
    const res = await this.http(`https://${conn.store.shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-access-token': this.keyring.decrypt(conn.accessTokenEnc) },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: unknown };
    if (!body.data) throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors).slice(0, 300)}`);
    return body.data;
  }

  async variants(storeId: string, variantIds: string[], fresh = false): Promise<Map<string, CatalogVariant>> {
    const out = new Map<string, CatalogVariant>();
    const missing: string[] = [];
    const now = Date.now();
    for (const id of new Set(variantIds)) {
      const hit = this.cache.get(`${storeId}:${id}`);
      if (!fresh && hit && now - hit.at < this.ttlMs) out.set(id, hit.value);
      else missing.push(id);
    }
    for (let i = 0; i < missing.length; i += 100) {
      const ids = missing.slice(i, i + 100).map((id) => idToGid('ProductVariant', id));
      const data = await this.gql<{ nodes: (GqlVariant | null)[] }>(
        storeId,
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { ${VARIANT_FIELDS} } } }`,
        { ids },
      );
      for (const node of data.nodes) {
        if (!node) continue;
        const v = toVariant(node);
        this.cache.set(`${storeId}:${v.variantId}`, { at: now, value: v });
        out.set(v.variantId, v);
      }
    }
    return out;
  }

  async search(storeId: string, query: string): Promise<CatalogProduct[]> {
    const q = query.replace(/["\\]/g, ' ').trim();
    const data = await this.gql<{ products: { nodes: { id: string }[] } }>(
      storeId,
      `query($q: String) { products(first: 20, query: $q, sortKey: TITLE) { nodes { id } } }`,
      { q: q ? `title:*${q}*` : null },
    );
    return this.products(storeId, data.products.nodes.map((n) => gidToId(n.id)));
  }

  async collections(storeId: string, opts: { query?: string; ids?: string[] }): Promise<CatalogCollection[]> {
    type Node = { id: string; title: string; image?: { url: string } | null };
    const map = (n: Node) => ({ collectionId: gidToId(n.id), title: n.title, image: n.image?.url });
    if (opts.ids) {
      if (opts.ids.length === 0) return [];
      const data = await this.gql<{ nodes: (Node | null)[] }>(
        storeId,
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Collection { id title image { url } } } }`,
        { ids: opts.ids.slice(0, 50).map((id) => idToGid('Collection', id)) },
      );
      return data.nodes.filter((n): n is Node => !!n?.id).map(map);
    }
    const q = (opts.query ?? '').replace(/["\\]/g, ' ').trim();
    const data = await this.gql<{ collections: { nodes: Node[] } }>(
      storeId,
      `query($q: String) { collections(first: 20, query: $q, sortKey: TITLE) { nodes { id title image { url } } } }`,
      { q: q ? `title:*${q}*` : null },
    );
    return data.collections.nodes.map(map);
  }

  async products(storeId: string, productIds: string[]): Promise<CatalogProduct[]> {
    if (productIds.length === 0) return [];
    const data = await this.gql<{ nodes: (null | { id: string; title: string; handle: string; featuredImage?: { url: string } | null; collections: { nodes: { id: string }[] }; variants: { nodes: GqlVariant[] } })[] }>(
      storeId,
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product {
         id title handle featuredImage { url } collections(first: 50) { nodes { id } }
         variants(first: 50) { nodes { ${VARIANT_FIELDS} } } } } }`,
      { ids: productIds.slice(0, 50).map((id) => idToGid('Product', id)) },
    );
    return data.nodes.filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({
      productId: gidToId(p.id),
      title: p.title,
      handle: p.handle,
      image: p.featuredImage?.url,
      collectionIds: p.collections.nodes.map((c) => gidToId(c.id)),
      variants: p.variants.nodes.map(toVariant),
    }));
  }
}
