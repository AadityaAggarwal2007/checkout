import { z } from 'zod';
import type { DrawerSettings } from './drawer.js';

/** GET /storefront/config — what the drawer needs on page load (public, cached). */
export interface StorefrontConfig {
  storeName: string;
  version: number;
  drawer: DrawerSettings;
  /** Codes shown in the "Apply discount code" sheet (only coupons marked visible). */
  visibleCodes: Array<{ code: string; title?: string }>;
  checkoutUrl: string;
}

export const priceRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1).max(200),
        variantId: z.string().regex(/^\d{1,20}$/),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .max(100),
  codes: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
});
export type PriceRequest = z.infer<typeof priceRequestSchema>;

/** What the drawer shows per line after pricing. */
export interface PricedCartLine {
  lineId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  discount: number;
  total: number;
  groupIds: string[];
  freeUnits: number;
}

export interface PriceResponse {
  lines: PricedCartLine[];
  gifts: Array<{ variantId: string; title: string; image?: string; unitPrice: number; quantity: number }>;
  subtotal: number;
  discount: number;
  total: number;
  savings: number;
  applied: Array<{ code?: string; title?: string; kind: string; amount: number; automatic: boolean; groupIds?: string[] }>;
  rejected: Array<{ code: string; message: string }>;
  /** groupId -> label, e.g. "b1g1#1" -> "B1G1 applied!" */
  groups: Record<string, string>;
}
