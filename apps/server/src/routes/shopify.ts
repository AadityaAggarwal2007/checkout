import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomToken, safeEqual } from '../lib/crypto.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { normaliseShop, verifyQueryHmac, verifyWebhookHmac } from '../lib/shopify.js';
import { ensureStoreDefaults } from '../rules/defaults.js';
import { SESSION_COOKIE } from '../plugins/auth.js';

const OAUTH_COOKIE = 'ck_oauth';

export function shopifyRoutes(app: FastifyInstance): void {
  /** Start of install / re-auth. Shopify calls this with ?shop=&hmac=&timestamp=. */
  app.get('/shopify/install', async (req, reply) => {
    const { env, tokens } = app.deps;
    const query = req.query as Record<string, string>;
    const shop = normaliseShop(query.shop);
    if (!shop) throw badRequest('Missing or invalid shop.');
    if (query.hmac && !verifyQueryHmac(query, env.SHOPIFY_API_SECRET)) throw unauthorized('Invalid Shopify signature.');
    const nonce = randomToken(16);
    const state = await tokens.sign('oauth_state', { shop, nonce }, 600);
    reply.setCookie(OAUTH_COOKIE, nonce, {
      httpOnly: true,
      secure: env.PUBLIC_URL.startsWith('https:'), // every https server, the demo too
      sameSite: 'lax',
      path: '/shopify',
      maxAge: 600,
    });
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set('client_id', env.SHOPIFY_API_KEY);
    url.searchParams.set('scope', env.SHOPIFY_SCOPES);
    url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/shopify/callback`);
    url.searchParams.set('state', state);
    return reply.redirect(url.toString());
  });

  app.get('/shopify/callback', async (req, reply) => {
    const { env, tokens, prisma, keyring, shopify } = app.deps;
    const query = req.query as Record<string, string>;
    const shop = normaliseShop(query.shop);
    if (!shop || !query.code) throw badRequest('Missing parameters.');
    if (!verifyQueryHmac(query, env.SHOPIFY_API_SECRET)) throw unauthorized('Invalid Shopify signature.');
    const state = await tokens.verify<{ shop: string; nonce: string }>('oauth_state', query.state);
    const cookieNonce = req.cookies[OAUTH_COOKIE] ?? '';
    if (!state || state.shop !== shop || !safeEqual(state.nonce, cookieNonce)) {
      throw unauthorized('This install link has expired. Start again from Shopify.');
    }
    reply.clearCookie(OAUTH_COOKIE, { path: '/shopify' });

    const { accessToken, scope } = await shopify.exchangeCode(shop, query.code);
    const info = await shopify.shopInfo(shop, accessToken);
    const accessTokenEnc = keyring.encrypt(accessToken);

    const store = await prisma.$transaction(async (tx) => {
      const s = await tx.store.upsert({
        where: { shopDomain: shop },
        create: { shopDomain: shop, name: info.name, domain: info.domain, currency: info.currency },
        update: { name: info.name, domain: info.domain, status: 'ACTIVE' },
      });
      await tx.shopifyConnection.upsert({
        where: { storeId: s.id },
        create: { storeId: s.id, accessTokenEnc, scopes: scope },
        update: { accessTokenEnc, scopes: scope, uninstalledAt: null, installedAt: new Date() },
      });
      await ensureStoreDefaults(tx, s.id);
      return s;
    });

    // Logged in already? Link the store right away (only if nobody owns it yet).
    const session = await tokens.verify<{ sub: string }>('session', req.cookies[SESSION_COOKIE]);
    if (session) {
      const owner = await prisma.storeMember.findFirst({ where: { storeId: store.id, role: 'OWNER' } });
      if (!owner) await prisma.storeMember.create({ data: { storeId: store.id, userId: session.sub, role: 'OWNER' } });
      if (!owner || owner.userId === session.sub) return reply.redirect(`${env.DASHBOARD_URL}/stores/${store.id}`);
    }
    const claim = await tokens.sign('store_claim', { storeId: store.id }, 30 * 60);
    return reply.redirect(`${env.DASHBOARD_URL}/connect?claim=${encodeURIComponent(claim)}`);
  });

  /** All Shopify webhooks (incl. the mandatory privacy ones). Verified, idempotent, answered fast. */
  app.post('/webhooks/shopify', async (req, reply) => {
    const { env, prisma } = app.deps;
    const raw = req.rawBody ?? Buffer.alloc(0);
    if (!verifyWebhookHmac(raw, header(req, 'x-shopify-hmac-sha256'), env.SHOPIFY_API_SECRET)) {
      return reply.code(401).send({ error: 'invalid signature' });
    }
    const id = header(req, 'x-shopify-webhook-id');
    const topic = header(req, 'x-shopify-topic') ?? '';
    const shop = normaliseShop(header(req, 'x-shopify-shop-domain'));
    if (!id || !shop) return reply.code(400).send({ error: 'missing headers' });

    const seen = await prisma.shopifyWebhookEvent.findUnique({ where: { id } });
    if (seen?.processedAt) return { ok: true, duplicate: true };
    if (!seen) await prisma.shopifyWebhookEvent.create({ data: { id, shopDomain: shop, topic } });

    try {
      await handleWebhook(app, topic, shop, (req.body ?? {}) as Record<string, unknown>);
      await prisma.shopifyWebhookEvent.update({ where: { id }, data: { processedAt: new Date(), error: null } });
    } catch (err) {
      await prisma.shopifyWebhookEvent.update({ where: { id }, data: { error: String(err).slice(0, 500) } });
      throw err; // 500 -> Shopify retries
    }
    return { ok: true };
  });
}

function header(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function handleWebhook(app: FastifyInstance, topic: string, shop: string, body: Record<string, unknown>): Promise<void> {
  const { prisma } = app.deps;
  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (!store) return;
  switch (topic) {
    case 'app/uninstalled':
      await prisma.$transaction([
        prisma.store.update({ where: { id: store.id }, data: { status: 'UNINSTALLED' } }),
        // The token is dead anyway; do not keep it.
        prisma.shopifyConnection.updateMany({ where: { storeId: store.id }, data: { accessTokenEnc: '', uninstalledAt: new Date() } }),
      ]);
      return;
    case 'shop/redact':
      // Shopify sends this 48 h after uninstall: erase everything we hold for the shop.
      await prisma.store.delete({ where: { id: store.id } });
      return;
    case 'customers/redact': {
      const customer = body.customer as { phone?: string | null } | undefined;
      const phone = customer?.phone ?? undefined;
      if (phone) await prisma.customer.deleteMany({ where: { storeId: store.id, phone } });
      return;
    }
    case 'customers/data_request':
      // We only hold what the merchant can already export from the dashboard; logged above.
      return;
    default:
      return;
  }
}
