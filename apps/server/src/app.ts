import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Deps } from './context.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { shopifyRoutes } from './routes/shopify.js';
import { storeRoutes } from './routes/stores.js';

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

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  // Dashboard API: only the dashboard origin, with cookies.
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origin === deps.env.DASHBOARD_URL),
    credentials: true,
  });

  // Cross-site requests cannot send JSON without a CORS preflight, so requiring JSON on
  // every state-changing /api call blocks CSRF from forms.
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const type = String(req.headers['content-type'] ?? '');
      if (!type.startsWith('application/json')) throw new HttpError(415, 'json_only', 'Send JSON.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'bad_request', message: err.message });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  healthRoutes(app);
  authRoutes(app);
  storeRoutes(app);
  shopifyRoutes(app);
  return app;
}
