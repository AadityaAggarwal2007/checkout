import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Deps } from './context.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { checkoutRoutes } from './routes/checkout.js';
import { couponRoutes } from './routes/coupons.js';
import { drawerRoutes } from './routes/drawers.js';
import { healthRoutes } from './routes/health.js';
import { orderRoutes } from './routes/orders.js';
import { paymentRoutes } from './routes/payments.js';
import { abandonedRoutes } from './routes/abandoned.js';
import { analyticsRoutes } from './routes/analytics.js';
import { publicApiRoutes } from './routes/public-api.js';
import { settingsRoutes } from './routes/settings.js';
import { designRoutes } from './routes/design.js';
import { rtoRoutes } from './routes/rto.js';
import { upsellRoutes } from './routes/upsell.js';
import { shippingRoutes } from './routes/shipping.js';
import { shopifyRoutes } from './routes/shopify.js';
import { storeRoutes } from './routes/stores.js';
import { storefrontRoutes } from './routes/storefront.js';

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true, // nginx in front sets X-Forwarded-For
    bodyLimit: 1024 * 1024,
  });
  app.decorate('deps', deps);

  // Keep the raw body (Shopify / gateway signatures are over the exact bytes).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    req.rawBody = body;
    if (body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch {
      done(new HttpError(400, 'bad_json', 'Invalid JSON.'), undefined);
    }
  });

  // Gateways post their callbacks as forms; keep the raw bytes too.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    req.rawBody = body;
    done(null, Object.fromEntries(new URLSearchParams(body.toString('utf8'))));
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  // Dashboard API: only the dashboard origin, with cookies. /storefront/* sets its own open CORS;
  // the checkout page and its API are same-origin only; gateways need no CORS.
  await app.register(cors, {
    delegator: (req, cb) => {
      if (/^\/(storefront|checkout|webhooks)\//.test(req.url ?? '')) return cb(null, { origin: false });
      cb(null, { origin: (origin, done) => done(null, !origin || origin === deps.env.DASHBOARD_URL), credentials: true });
    },
  });

  // CSRF: a form on another site can only send a simple POST. Requiring JSON on POST / PUT /
  // PATCH forces a CORS preflight, which only the dashboard origin passes. DELETE (no body)
  // is never a simple request, so the browser already preflights it.
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/') && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const type = String(req.headers['content-type'] ?? '');
      if (!type.startsWith('application/json')) throw new HttpError(415, 'json_only', 'Send JSON.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) req.log.warn({ err: err.cause ?? err }, err.message);
      return reply.code(err.status).send({ ...err.data, error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'bad_request', message: err.message });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  healthRoutes(app);
  authRoutes(app);
  storeRoutes(app);
  shopifyRoutes(app);
  drawerRoutes(app);
  paymentRoutes(app);
  couponRoutes(app);
  shippingRoutes(app);
  rtoRoutes(app);
  designRoutes(app);
  analyticsRoutes(app);
  abandonedRoutes(app);
  settingsRoutes(app);
  publicApiRoutes(app);
  upsellRoutes(app);
  orderRoutes(app);
  storefrontRoutes(app);
  checkoutRoutes(app);
  return app;
}
