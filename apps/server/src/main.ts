import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { Keyring } from './lib/crypto.js';
import { db } from './lib/db.js';
import { shopifyApi } from './lib/shopify.js';
import { Tokens } from './lib/tokens.js';

const env = loadEnv();
const app = await buildApp(
  {
    env,
    prisma: db(),
    keyring: new Keyring(env.ENCRYPTION_KEYS),
    tokens: new Tokens(env.JWT_SECRET),
    shopify: shopifyApi({ apiKey: env.SHOPIFY_API_KEY, apiSecret: env.SHOPIFY_API_SECRET, apiVersion: env.SHOPIFY_API_VERSION }),
  },
  { logger: true },
);
await app.listen({ port: env.PORT, host: '127.0.0.1' });
