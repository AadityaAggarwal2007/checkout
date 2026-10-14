import { z } from 'zod';

const base64Key = z.string().min(40, 'expected base64 of 32+ random bytes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5002),
  PUBLIC_URL: z.string().url(),
  DASHBOARD_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: base64Key,
  ENCRYPTION_KEYS: z.string().regex(/^[\w-]+:[A-Za-z0-9+/=]{40,}(,[\w-]+:[A-Za-z0-9+/=]{40,})*$/, 'keyId:base64key[,keyId:base64key]'),
  HASH_PEPPER: base64Key,
  SHOPIFY_API_KEY: z.string().default(''),
  SHOPIFY_API_SECRET: z.string().default(''),
  SHOPIFY_SCOPES: z.string().default('read_products,write_orders,read_orders'),
  SHOPIFY_API_VERSION: z.string().default('2025-01'),
  /** 'shopify' = real stores; 'dev' = products from DEV_CATALOG_FILE (local test store). */
  CATALOG: z.enum(['shopify', 'dev']).default('shopify'),
  DEV_CATALOG_FILE: z.string().default('../devstore/catalog.json'),
  /** Built storefront script (apps/storefront/dist/loader.js). */
  STOREFRONT_DIST: z.string().default('../storefront/dist/loader.js'),
  /** Where the checkout page is served (iframe). Defaults to PUBLIC_URL. */
  CHECKOUT_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

/** Reads and validates the environment once. Fails fast with every problem listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${problems}`);
  }
  return parsed.data;
}
