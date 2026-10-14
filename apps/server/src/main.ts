import { pincodeLookupFrom } from './address/pincode.js';
import { buildApp } from './app.js';
import { DevCatalog } from './catalog/dev.js';
import { ShopifyCatalog } from './catalog/shopify.js';
import { loadEnv } from './env.js';
import { Keyring } from './lib/crypto.js';
import { db } from './lib/db.js';
import { shopifyApi } from './lib/shopify.js';
import { Tokens } from './lib/tokens.js';
import { otpSenderFrom } from './messaging/otp-sender.js';
import { retryShopifyOrders } from './orders/create.js';
import { orderSinkFrom } from './orders/sink.js';
import { GatewayRegistry } from './payments/registry.js';

const env = loadEnv();
const prisma = db();
const keyring = new Keyring(env.ENCRYPTION_KEYS);
const catalog = env.CATALOG === 'dev' ? new DevCatalog(env.DEV_CATALOG_FILE, env.DEV_STORE_URL) : new ShopifyCatalog(prisma, keyring, env.SHOPIFY_API_VERSION);
const orderSink = orderSinkFrom(env, prisma, keyring);
const app = await buildApp(
  {
    catalog,
    env,
    prisma,
    keyring,
    tokens: new Tokens(env.JWT_SECRET),
    shopify: shopifyApi({ apiKey: env.SHOPIFY_API_KEY, apiSecret: env.SHOPIFY_API_SECRET, apiVersion: env.SHOPIFY_API_VERSION }),
    otp: otpSenderFrom(env),
    gateways: new GatewayRegistry({ env, prisma, keyring }),
    orderSink,
    pincodes: pincodeLookupFrom(env),
  },
  { logger: true },
);
await app.listen({ port: env.PORT, host: '127.0.0.1' });

// Background jobs (one process): orders that did not reach Shopify yet, and open payments
// whose shopper never came back (the gateway still confirms them server to server).
const every = (ms: number, job: () => Promise<unknown>) =>
  setInterval(() => void job().catch((err) => app.log.warn({ err }, 'job failed')), ms).unref();
every(60_000, () => retryShopifyOrders(prisma, orderSink));
every(60_000, async () => {
  const open = await prisma.paymentTransaction.findMany({
    where: { status: 'PENDING', createdAt: { gt: new Date(Date.now() - 6 * 3600_000), lt: new Date(Date.now() - 2 * 60_000) } },
    select: { merchantRef: true },
    take: 50,
  });
  for (const t of open) await app.checkout.settle(t.merchantRef, { minIntervalMs: 60_000 });
});
