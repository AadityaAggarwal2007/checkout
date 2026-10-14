import { buildApp } from './app.js';
import { DevCatalog } from './catalog/dev.js';
import { ShopifyCatalog } from './catalog/shopify.js';
import { loadEnv } from './env.js';
import { Keyring } from './lib/crypto.js';
import { db } from './lib/db.js';
import { shopifyApi } from './lib/shopify.js';
import { Tokens } from './lib/tokens.js';

const env = loadEnv();
const prisma = db();
const keyring = new Keyring(env.ENCRYPTION_KEYS);
const catalog = env.CATALOG === 'dev' ? new DevCatalog(env.DEV_CATALOG_FILE) : new ShopifyCatalog(prisma, keyring, env.SHOPIFY_API_VERSION);
const app = await buildApp(
  {
    catalog,
    env,
    prisma,
    keyring,
    tokens: new Tokens(env.JWT_SECRET),
    shopify: shopifyApi({ apiKey: env.SHOPIFY_API_KEY, apiSecret: env.SHOPIFY_API_SECRET, apiVersion: env.SHOPIFY_API_VERSION }),
  },
  { logger: true },
);
await app.listen({ port: env.PORT, host: '127.0.0.1' });
