import { PAYMENT_METHODS, type PaymentMethod } from '@checkout/core';
import { createCheckoutSchema, maskPhone, normalizeIndianMobile } from '@checkout/shared';
import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { forgetDevice, sendOtp, verifyOtp } from '../checkout/otp.js';
import { esc, gatewayPostPage, notifyOpenerScript, rupee, sendPage } from '../checkout/pages.js';
import { CheckoutService, isTestKey, SESSION_TTL_SECONDS, storeOrigins, storeUrl, type SessionWithStore } from '../checkout/service.js';
import { sha256Hex } from '../lib/crypto.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';
import { normaliseShop } from '../lib/shopify.js';
import { DevOtpSender } from '../messaging/otp-sender.js';

/**
 * The shopper's checkout.
 * - /storefront/checkout          the store page creates a checkout (CORS *, no personal data)
 * - /checkout/s/:id               the page in the iframe (our origin; frame-ancestors = the store)
 * - /checkout/api/*               its API: Bearer = checkout token, x-ck-device = OTP-proved device
 * - /checkout/go|return|done/:ref the gateway round trip (top-level pages)
 * - /webhooks/gateway/:provider   gateway notifications (only say WHICH payment to re-check)
 */
export function checkoutRoutes(app: FastifyInstance): void {
  const { prisma, env } = app.deps;
  const service = new CheckoutService(app.deps);
  app.decorate('checkout', service);
  const checkoutOrigin = new URL(env.CHECKOUT_URL ?? env.PUBLIC_URL).origin;

  // ------------------------------------------------------------ create (from the store)

  app.post('/storefront/checkout', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { key, shop, test } = req.query as { key?: string; shop?: string; test?: string };
    const shopDomain = normaliseShop(shop);
    if ((!key || key.length > 64) && !shopDomain) throw badRequest('Missing store key.');
    const store = key ? await prisma.store.findUnique({ where: { widgetKey: key } }) : await prisma.store.findUnique({ where: { shopDomain: shopDomain! } });
    if (!store || store.status === 'UNINSTALLED' || store.status === 'PAUSED') throw notFound('Store not found.');
    const settings = await prisma.storeSettings.findUnique({ where: { storeId: store.id } });
    // Live for everyone once switched on; before that only with the merchant's test link.
    if (!settings?.checkoutEnabled && !isTestKey(env.HASH_PEPPER, store.id, test)) throw new HttpError(403, 'checkout_off', 'Checkout is not switched on for this store.');
    const body = createCheckoutSchema.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid cart.');
    const { session, url, token } = await service.create(store, body.data);
    return reply.header('access-control-allow-origin', '*').header('cache-control', 'no-store').send({ sessionId: session.id, url, token });
  });

  // ------------------------------------------------------------ the page

  const assets = new Map<string, Buffer>();
  const asset = async (name: string) => {
    if (!assets.has(name) || env.NODE_ENV === 'development') {
      const buf = await readFile(join(env.CHECKOUT_DIST, name)).catch(() => undefined);
      if (!buf) return undefined;
      assets.set(name, buf);
    }
    return assets.get(name);
  };

  app.get('/checkout/assets/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!/^app\.(js|css)$/.test(file)) throw notFound();
    const buf = await asset(file);
    if (!buf) throw notFound('checkout not built');
    return reply
      .header('content-type', file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8')
      .header('cache-control', env.NODE_ENV === 'development' ? 'no-store' : 'public, max-age=300')
      .header('x-content-type-options', 'nosniff')
      .send(buf);
  });

  app.get('/checkout/s/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = /^[a-z0-9]{20,40}$/.test(id) ? await prisma.checkoutSession.findUnique({ where: { id }, include: { store: true } }) : null;
    if (!session) throw notFound('Checkout not found.');
    const js = await asset('app.js');
    const version = js ? sha256Hex(js).slice(0, 10) : '0';
    const ancestors = storeOrigins(session.store).join(' ');
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('x-content-type-options', 'nosniff')
      .header(
        'content-security-policy',
        `default-src 'self'; img-src 'self' https: data: ${storeUrl(session.store)}; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self' ${ancestors}; form-action 'self'; base-uri 'none'`,
      )
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">` +
          `<title>Checkout · ${esc(session.store.name)}</title><link rel="stylesheet" href="/checkout/assets/app.css?v=${version}"></head>` +
          `<body><div id="app"></div><script src="/checkout/assets/app.js?v=${version}"></script></body></html>`,
      );
  });

  /** Live preview for Dashboard > Checkout design: the real page with sample data (no store, no shopper). */
  app.get('/checkout/preview', async (_req, reply) => {
    const js = await asset('app.js');
    const version = js ? sha256Hex(js).slice(0, 10) : '0';
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'")
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>Checkout preview</title><link rel="stylesheet" href="/checkout/assets/app.css?v=${version}"></head>` +
          `<body><div id="app" data-preview></div><script src="/checkout/assets/app.js?v=${version}"></script></body></html>`,
      );
  });

  // ------------------------------------------------------------ page API

  type Ctx = { session: SessionWithStore; device?: string };
  const auth = async (req: FastifyRequest): Promise<Ctx> => {
    const header = String(req.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const session = await service.sessionFromToken(token);
    const device = req.headers['x-ck-device'];
    return { session, device: typeof device === 'string' ? device : undefined };
  };
  const send = (reply: FastifyReply, body: unknown) => reply.header('cache-control', 'no-store').send(body);
  const needCustomer = async (ctx: Ctx) => {
    const customer = await service.customerOf(ctx.session, ctx.device);
    if (!customer) throw new HttpError(401, 'login_needed', 'Please verify your phone number first.');
    return customer;
  };
  // Per checkout and address (several shoppers can share one IP behind a mobile network).
  // The OTP's own limits (per phone, per IP per hour) live in the database: see otp.ts.
  const limit = (max: number) => ({
    config: { rateLimit: { max, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `${req.ip}|${String(req.headers.authorization ?? '').slice(-32)}` } },
  });

  app.get('/checkout/api/session', limit(120), async (req, reply) => {
    const ctx = await auth(req);
    if (ctx.session.status === 'PAYING') {
      await service.refresh(ctx.session);
      Object.assign(ctx.session, await prisma.checkoutSession.findUniqueOrThrow({ where: { id: ctx.session.id } }));
    }
    const customer = await service.customerOf(ctx.session, ctx.device);
    return send(reply, { state: await service.state(ctx.session, customer) });
  });

  app.post('/checkout/api/otp/send', limit(10), async (req, reply) => {
    const ctx = await auth(req);
    const phone = normalizeIndianMobile((req.body as { phone?: string })?.phone);
    if (!phone) throw badRequest('Enter a valid 10-digit mobile number.', 'invalid_phone');
    const out = await sendOtp(app.deps, ctx.session.storeId, phone, req.ip);
    await prisma.checkoutSession.update({ where: { id: ctx.session.id }, data: { step: ctx.session.step === 'CART' ? 'LOGIN' : undefined } });
    // Local trial without WhatsApp (OTP_SENDER=dev, never in production): the page shows the code.
    const devCode = app.deps.otp instanceof DevOtpSender && env.NODE_ENV !== 'production' ? app.deps.otp.outbox.get(phone) : undefined;
    return send(reply, { challengeId: out.challengeId, resendInMs: out.resendInMs, phone: maskPhone(phone), devCode });
  });

  const verifyBody = z.object({ challengeId: z.string().uuid(), phone: z.string().max(20), code: z.string().trim().max(10) });
  app.post('/checkout/api/otp/verify', limit(20), async (req, reply) => {
    const ctx = await auth(req);
    const body = verifyBody.safeParse(req.body);
    const phone = normalizeIndianMobile(body.success ? body.data.phone : undefined);
    if (!body.success || !phone) throw badRequest('Enter the 6-digit code.', 'otp_wrong');
    const { deviceToken } = await verifyOtp(app.deps, ctx.session.storeId, {
      challengeId: body.data.challengeId,
      phone,
      code: body.data.code,
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
    // A returning shopper's default address is chosen here too (straight to payment).
    const customer = await service.customerOf(ctx.session, deviceToken);
    return send(reply, { deviceToken, state: await service.state(ctx.session, customer) });
  });

  app.post('/checkout/api/logout', async (req, reply) => {
    const ctx = await auth(req);
    await forgetDevice(prisma, ctx.session, ctx.device);
    const session = await service.sessionFromToken(String(req.headers.authorization).slice(7));
    return send(reply, { state: await service.state(session, null) });
  });

  app.post('/checkout/api/address', limit(30), async (req, reply) => {
    const ctx = await auth(req);
    const customer = await needCustomer(ctx);
    await service.chooseAddress(ctx.session, customer, (req.body ?? {}) as { addressId?: string; address?: unknown; email?: string });
    return send(reply, { state: await service.state(ctx.session, customer) });
  });

  /** Back from the payment step to change the address. */
  app.post('/checkout/api/address/edit', async (req, reply) => {
    const ctx = await auth(req);
    const customer = await needCustomer(ctx);
    if (!ctx.session.completedAt) {
      await prisma.checkoutSession.updateMany({ where: { id: ctx.session.id, completedAt: null }, data: { address: Prisma.DbNull, status: 'OPEN' } });
      ctx.session.address = null;
    }
    return send(reply, { state: await service.state(ctx.session, customer) });
  });

  app.get('/checkout/api/pincode/:pin', limit(60), async (req, reply) => {
    await auth(req);
    const { pin } = req.params as { pin: string };
    if (!/^[1-9]\d{5}$/.test(pin)) throw badRequest('Enter a 6-digit pincode.');
    const info = await app.deps.pincodes.lookup(pin);
    if (!info) throw notFound('Pincode not found.');
    return reply.header('cache-control', 'private, max-age=86400').send(info);
  });

  const couponBody = z.object({ add: z.string().max(40).optional(), remove: z.string().max(40).optional() });
  app.post('/checkout/api/coupon', limit(30), async (req, reply) => {
    const ctx = await auth(req);
    const body = couponBody.safeParse(req.body);
    if (!body.success) throw badRequest('Enter a code.');
    await service.setCodes(ctx.session, body.data);
    const customer = await service.customerOf(ctx.session, ctx.device);
    return send(reply, { state: await service.state(ctx.session, customer) });
  });

  const upsellBody = z.object({ variantId: z.string().regex(/^\d{1,20}$/).optional(), lineId: z.string().max(40).optional() });
  app.post('/checkout/api/upsell', limit(30), async (req, reply) => {
    const ctx = await auth(req);
    const customer = await needCustomer(ctx);
    const body = upsellBody.safeParse(req.body);
    if (!body.success || (!body.data.variantId && !body.data.lineId)) throw badRequest('Choose an item.');
    if (body.data.variantId) await service.addUpsell(ctx.session, customer, body.data.variantId);
    else await service.removeUpsell(ctx.session, body.data.lineId!);
    return send(reply, { state: await service.state(ctx.session, customer) });
  });

  /** Exit survey: why the shopper left (one answer per checkout; no personal data). */
  const exitBody = z.object({ reason: z.string().trim().min(1).max(40), comment: z.string().trim().max(300).optional() });
  app.post('/checkout/api/exit', limit(10), async (req, reply) => {
    const ctx = await auth(req);
    const body = exitBody.safeParse(req.body);
    if (!body.success) throw badRequest('Choose a reason.');
    const { settings } = await service.context(ctx.session, null);
    if (!settings.exit.reasons.includes(body.data.reason)) throw badRequest('Choose a reason.');
    const done = await prisma.exitSurveyResponse.findFirst({ where: { sessionId: ctx.session.id }, select: { id: true } });
    if (!done && !ctx.session.completedAt) {
      await prisma.exitSurveyResponse.create({ data: { storeId: ctx.session.storeId, sessionId: ctx.session.id, reason: body.data.reason, comment: body.data.comment || null } });
    }
    return send(reply, { ok: true });
  });

  const payBody = z.object({ method: z.enum(PAYMENT_METHODS), expectedTotal: z.number().int().min(0) });
  app.post('/checkout/api/pay', limit(20), async (req, reply) => {
    const ctx = await auth(req);
    const customer = await needCustomer(ctx);
    const body = payBody.safeParse(req.body);
    if (!body.success) throw badRequest('Choose a payment method.');
    // The shopper's address and browser go to the gateway only for the server-to-server UPI start (PayU asks for them).
    const client = { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) };
    const out = await service.pay(ctx.session, customer, body.data.method as PaymentMethod, body.data.expectedTotal, client);
    const fresh = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: ctx.session.id }, include: { store: true } });
    return send(reply, { pay: out.pay ?? null, upi: out.upi ?? null, state: await service.state(fresh, customer) });
  });

  app.post('/checkout/api/pay/cancel', async (req, reply) => {
    const ctx = await auth(req);
    const customer = await needCustomer(ctx);
    await service.cancelPending(ctx.session);
    const fresh = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: ctx.session.id }, include: { store: true } });
    return send(reply, { state: await service.state(fresh, customer) });
  });

  // ------------------------------------------------------------ gateway round trip

  app.get('/checkout/go/:ref', async (req, reply) => {
    const { ref } = req.params as { ref: string };
    const txn = await service.transaction(ref);
    if (!txn) throw notFound('Payment not found.');
    if (txn.status === 'SUCCESS' || txn.session.completedAt) return reply.redirect(`/checkout/done/${ref}`, 303);
    if (txn.status === 'FAILED') return reply.redirect(`/checkout/done/${ref}`, 303);
    try {
      const start = await service.startGateway(txn);
      if (start.kind === 'redirect') return reply.header('referrer-policy', 'no-referrer').redirect(start.url, 303);
      return gatewayPostPage(reply, start.url, start.fields);
    } catch (err) {
      req.log.warn({ err, ref }, 'gateway start failed');
      await prisma.paymentTransaction.update({ where: { id: txn.id }, data: { status: 'FAILED', raw: { problem: 'start failed' } } });
      await prisma.checkoutSession.updateMany({ where: { id: txn.sessionId, completedAt: null }, data: { status: 'OPEN', step: 'PAYMENT' } });
      return reply.redirect(`/checkout/done/${ref}`, 303);
    }
  });

  const back = async (req: FastifyRequest, reply: FastifyReply) => {
    const { ref } = req.params as { ref: string };
    await service.settle(ref);
    return reply.redirect(`/checkout/done/${ref}`, 303);
  };
  app.get('/checkout/return/:ref', back);
  app.post('/checkout/return/:ref', back);

  app.get('/checkout/done/:ref', async (req, reply) => {
    const { ref } = req.params as { ref: string };
    const txn = await service.transaction(ref);
    if (!txn) throw notFound('Payment not found.');
    const result = await service.settle(ref, { minIntervalMs: 3000 });
    const store = txn.session.store;
    const shop = storeUrl(store);
    const order = await prisma.order.findUnique({ where: { sessionId: txn.sessionId } });
    if (order) {
      const rows = [
        ['Order', order.number],
        ['Total', rupee(order.total)],
        ...(order.paidAmount > 0 ? [['Paid', rupee(order.paidAmount)]] : []),
        ...(order.dueOnDelivery > 0 ? [['Pay on delivery', rupee(order.dueOnDelivery)]] : []),
      ];
      return sendPage(reply, {
        title: 'Order placed',
        body:
          `<div class="big">✅</div><h1>Thank you! Your order is placed.</h1><p>Keep the order number for any questions about your order.</p>` +
          `<div class="rows">${rows.map(([k, v]) => `<div><span>${esc(k!)}</span><b>${esc(v!)}</b></div>`).join('')}</div>` +
          `<a class="btn" href="${esc(shop)}/#ck_done=${encodeURIComponent(`${order.number}.${order.total}`)}">Continue shopping</a><p class="muted">${esc(store.name)}</p>`,
        script: notifyOpenerScript(checkoutOrigin, 'ck:paid', shop),
      });
    }
    if (result === 'pending' || result === 'unknown') {
      return sendPage(reply, {
        title: 'Confirming payment',
        refreshSeconds: 3,
        body: `<div class="spin"></div><h1>Confirming your payment…</h1><p>This takes a few seconds. Please do not pay again.</p>`,
        script: notifyOpenerScript(checkoutOrigin, 'ck:pending', shop),
      });
    }
    const resume = await app.deps.tokens.sign('checkout', { sid: txn.sessionId }, SESSION_TTL_SECONDS);
    return sendPage(reply, {
      title: 'Payment failed',
      body:
        `<div class="big">⚠️</div><h1>Payment did not go through</h1><p>No money was taken. If any was, your bank returns it.</p>` +
        `<a class="btn" href="${esc(shop)}/#ck_resume=${encodeURIComponent(resume)}">Try again</a>` +
        `<a class="btn alt" href="${esc(shop)}">Back to store</a>`,
      script: notifyOpenerScript(checkoutOrigin, 'ck:failed', shop),
    });
  });

  // ------------------------------------------------------------ webhooks

  app.post('/webhooks/gateway/:provider', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
    const provider = String((req.params as { provider: string }).provider).toUpperCase();
    if (!['PAYU', 'PAYGLOCAL'].includes(provider)) throw notFound();
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ref: string | null = null;
    if (provider === 'PAYU') ref = typeof body.txnid === 'string' ? body.txnid : null;
    else if (typeof body['x-gl-token'] === 'string') {
      try {
        const payload = JSON.parse(Buffer.from(String(body['x-gl-token']).split('.')[1] ?? '', 'base64url').toString('utf8')) as { merchantTxnId?: string };
        ref = payload.merchantTxnId ?? null;
      } catch {
        ref = null;
      }
    }
    const event = await prisma.gatewayEvent
      .create({ data: { provider, bodyHash: sha256Hex(raw), merchantRef: ref } })
      .catch(() => null); // same delivery again: already handled
    if (event && ref) {
      // The body is never trusted: it only tells us which payment to check with the gateway.
      const result = await service.settle(ref).catch((err) => {
        req.log.warn({ err, ref }, 'webhook settle failed');
        return 'error';
      });
      await prisma.gatewayEvent.update({ where: { id: event.id }, data: { processed: result !== 'error', error: result === 'error' ? 'settle failed' : null } });
    }
    return reply.send({ ok: true });
  });

  // ------------------------------------------------------------ local only

  if (app.deps.gateways.devAllowed()) {
    app.get('/checkout/dev-gateway/:ref', async (req, reply) => {
      const { ref } = req.params as { ref: string };
      const txn = await service.transaction(ref);
      if (!txn || txn.provider !== 'DEV') throw notFound();
      return sendPage(reply, {
        title: 'Test gateway',
        body:
          `<h1>Test payment</h1><p>Local test gateway — no real money.</p><div class="rows"><div><span>Amount</span><b>${esc(rupee(txn.amount))}</b></div>` +
          `<div><span>Method</span><b>${esc(txn.method ?? '')}</b></div></div>` +
          `<form method="post"><button class="btn" name="result" value="success">Pay ${esc(rupee(txn.amount))}</button>` +
          `<button class="btn alt" name="result" value="failed">Fail payment</button></form>`,
      });
    });
    app.post('/checkout/dev-gateway/:ref', async (req, reply) => {
      const { ref } = req.params as { ref: string };
      const result = (req.body as { result?: string })?.result === 'success' ? 'success' : 'failed';
      const txn = await service.transaction(ref);
      if (!txn || txn.provider !== 'DEV') throw notFound();
      await prisma.paymentTransaction.update({ where: { id: txn.id }, data: { raw: { ...((txn.raw as object) ?? {}), dev: result } } });
      return reply.redirect(`/checkout/return/${ref}`, 303);
    });
  }

  if (app.deps.otp instanceof DevOtpSender && env.NODE_ENV !== 'production') {
    const outbox = app.deps.otp.outbox;
    /** Local runs and e2e tests read the code here instead of WhatsApp. */
    app.get('/checkout/dev/otp', async (req, reply) => {
      const phone = normalizeIndianMobile((req.query as { phone?: string }).phone);
      const code = phone ? outbox.get(phone) : undefined;
      if (!code) throw notFound('No code sent to this number.');
      return reply.send({ code });
    });
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    checkout: CheckoutService;
  }
}
