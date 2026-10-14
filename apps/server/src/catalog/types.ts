import type { Paise } from '@checkout/core';

/** Product data as the server needs it. Ids are Shopify's numeric ids as strings ("4567"). */
export interface CatalogVariant {
  variantId: string;
  productId: string;
  productTitle: string;
  title: string;
  image?: string;
  price: Paise;
  compareAtPrice?: Paise;
  collectionIds: string[];
  weightGrams?: number;
  available: boolean;
  sku?: string;
}

export interface CatalogProduct {
  productId: string;
  title: string;
  handle: string;
  image?: string;
  collectionIds: string[];
  variants: CatalogVariant[];
}

/** Where prices come from. The server never trusts prices sent by a browser. */
export interface Catalog {
  variants(storeId: string, variantIds: string[]): Promise<Map<string, CatalogVariant>>;
  products(storeId: string, productIds: string[]): Promise<CatalogProduct[]>;
  /** Dashboard product picker: title search, first 20. */
  search(storeId: string, query: string): Promise<CatalogProduct[]>;
}

export const gidToId = (gid: string): string => gid.slice(gid.lastIndexOf('/') + 1);
export const idToGid = (kind: 'ProductVariant' | 'Product', id: string): string => `gid://shopify/${kind}/${id}`;
