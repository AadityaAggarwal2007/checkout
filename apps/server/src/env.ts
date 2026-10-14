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
  /** Built checkout page (apps/checkout/dist: index.html is made by the server, app.js + app.css). */
  CHECKOUT_DIST: z.string().default('../checkout/dist'),
  /** Where the checkout page is served (iframe). Defaults to PUBLIC_URL. */
  CHECKOUT_URL: z.string().url().optional(),

  /** WhatsApp OTP: 'whatsapp' = Meta Cloud API; 'dev' = codes only in the server log (never in production). */
  OTP_SENDER: z.enum(['whatsapp', 'dev']).default('dev'),
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  /** Approved "authentication" template with one {{1}} = the code and a copy-code button. */
  WHATSAPP_OTP_TEMPLATE: z.string().default(''),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  /** '1' = the local test gateway can be added to a store (refused in production). */
  DEV_GATEWAY: z.enum(['0', '1']).default('0'),
  /** Where orders go: 'shopify' = Admin API of the store; 'dev' = the local test store (DEV_STORE_URL). */
  ORDER_SINK: z.enum(['shopify', 'dev']).default('shopify'),
  DEV_STORE_URL: z.string().url().default('http://localhost:5004'),
  /** How this server reaches the local test store when the browser uses another address (Codespaces). */
  DEV_STORE_INTERNAL_URL: z.string().url().optional(),
  /** Pincode -> city / state: 'india_post' (api.postalpincode.in), 'dev' (a few built-in pincodes), 'off'. */
  PINCODE_LOOKUP: z.enum(['india_post', 'dev', 'off']).default('india_post'),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  // Fakes can never run on a live server.
  if (e.OTP_SENDER === 'dev') ctx.addIssue({ code: 'custom', path: ['OTP_SENDER'], message: "must be 'whatsapp' in production" });
  if (e.DEV_GATEWAY === '1') ctx.addIssue({ code: 'custom', path: ['DEV_GATEWAY'], message: "must be '0' in production" });
  if (e.ORDER_SINK === 'dev') ctx.addIssue({ code: 'custom', path: ['ORDER_SINK'], message: "must be 'shopify' in production" });
  if (e.CATALOG === 'dev') ctx.addIssue({ code: 'custom', path: ['CATALOG'], message: "must be 'shopify' in production" });
  if (e.OTP_SENDER === 'whatsapp' && (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_OTP_TEMPLATE)) {
    ctx.addIssue({ code: 'custom', path: ['WHATSAPP_TOKEN'], message: 'WhatsApp token, phone number id and template are needed' });
  }
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
