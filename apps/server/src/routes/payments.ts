import { ONLINE_METHODS } from '@checkout/core';
import { GATEWAYS, type GatewayProviderKey, type GatewayView, type PaymentSettings, type PaymentsResponse } from '@checkout/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';
import { testKeyFor } from '../checkout/service.js';
import { credentialSchemas, publicInfoOf } from '../payments/registry.js';

const P = '/api/stores/:storeId';
type Params = { storeId: string; provider?: string };

const settingsBody = z.object({
  checkoutEnabled: z.boolean(),
  codEnabled: z.boolean(),
  codFee: z.number().int().min(0).max(100_000),
  codConfirmPopup: z.boolean(),
  partialCod: z.object({
    enabled: z.boolean(),
    type: z.enum(['fixed', 'percent']),
    amount: z.number().int().min(0).max(10_000_000),
    percent: z.number().min(0).max(100),
    min: z.number().int().min(0).nullable(),
    max: z.number().int().min(0).nullable(),
  }),
});

const gatewayBody = z.object({
  mode: z.enum(['test', 'live']),
  active: z.boolean(),
  /** Secret fields left empty keep their saved value. */
  credentials: z.record(z.string(), z.string().max(10_000)).default({}),
});

const routesBody = z.object({ routes: z.record(z.string(), z.enum(['PAYGLOCAL', 'PAYU', 'DEV']).nullable()) });

/**
 * Settings > Payments: our checkout on / off, COD and partial COD, gateway credentials
 * (write-only: secrets are encrypted and never sent back) and which gateway takes which method.
 */
export function paymentRoutes(app: FastifyInstance): void {
  const { prisma, keyring, env } = app.deps;
  const devAllowed = () => app.deps.gateways.devAllowed();
  const available = (): GatewayProviderKey[] => (devAllowed() ? ['PAYGLOCAL', 'PAYU', 'DEV'] : ['PAYGLOCAL', 'PAYU']);

  async function read(storeId: string): Promise<PaymentsResponse> {
    const [s, accounts, routes] = await Promise.all([
      prisma.storeSettings.upsert({ where: { storeId }, create: { storeId }, update: {} }),
      prisma.gatewayAccount.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } }),
      prisma.paymentRoute.findMany({ where: { storeId }, include: { gateway: true } }),
    ]);
    const settings: PaymentSettings = {
      checkoutEnabled: s.checkoutEnabled,
      codEnabled: s.codEnabled,
      codFee: s.codFee,
      codConfirmPopup: s.codConfirmPopup,
      partialCod: {
        enabled: s.partialCodEnabled,
        type: s.partialCodType === 'percent' ? 'percent' : 'fixed',
        amount: s.partialCodType === 'percent' ? 0 : s.partialCodValue,
        percent: s.partialCodType === 'percent' ? s.partialCodValue / 100 : 0,
        min: s.partialCodMin,
        max: s.partialCodMax,
      },
    };
    const gateways: GatewayView[] = accounts
      .filter((a) => a.provider !== 'DEV' || devAllowed())
      .map((a) => ({
        provider: a.provider,
        name: GATEWAYS[a.provider].name,
        mode: a.mode === 'live' ? 'live' : 'test',
        active: a.active,
        publicInfo: (a.publicInfo ?? {}) as Record<string, string>,
        secretsSet: a.provider === 'DEV' ? [] : GATEWAYS[a.provider].fields.filter((f) => f.secret).map((f) => f.key),
        webhookUrl: `${env.PUBLIC_URL}/webhooks/gateway/${a.provider.toLowerCase()}`,
      }));
    return {
      settings,
      gateways,
      routes: Object.fromEntries(routes.map((r) => [r.method, r.gateway.provider])),
      available: available(),
      testKey: testKeyFor(env.HASH_PEPPER, storeId),
    };
  }

  app.get(`${P}/payments`, { preHandler: requireStore('ADMIN') }, async (req) => read((req.params as Params).storeId));

  app.put(`${P}/payments/settings`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const body = settingsBody.safeParse(req.body);
    if (!body.success) throw badRequest(body.error.issues[0]?.message ?? 'Check the settings.');
    const b = body.data;
    if (b.checkoutEnabled) {
      const gateway = await prisma.gatewayAccount.count({ where: { storeId, active: true, provider: devAllowed() ? undefined : { not: 'DEV' } } });
      if (!gateway && !b.codEnabled) throw badRequest('Turn on a payment gateway or Cash on delivery before switching the checkout on.', 'nothing_to_pay_with');
    }
    if (b.partialCod.enabled && b.partialCod.type === 'fixed' && b.partialCod.amount <= 0) throw badRequest('Set the amount to pay now for partial COD.');
    if (b.partialCod.enabled && b.partialCod.type === 'percent' && (b.partialCod.percent <= 0 || b.partialCod.percent >= 100)) throw badRequest('Partial COD percent must be between 0 and 100.');
    const before = await prisma.storeSettings.findUnique({ where: { storeId } });
    await prisma.storeSettings.update({
      where: { storeId },
      data: {
        checkoutEnabled: b.checkoutEnabled,
        codEnabled: b.codEnabled,
        codFee: b.codFee,
        codConfirmPopup: b.codConfirmPopup,
        partialCodEnabled: b.partialCod.enabled,
        partialCodType: b.partialCod.type,
        partialCodValue: b.partialCod.type === 'percent' ? Math.round(b.partialCod.percent * 100) : b.partialCod.amount,
        partialCodMin: b.partialCod.min,
        partialCodMax: b.partialCod.max,
      },
    });
    if (before?.checkoutEnabled !== b.checkoutEnabled) {
      await logActivity(app, storeId, req.user!.id, 'checkout.switch', b.checkoutEnabled ? 'Switched the checkout ON for shoppers' : 'Switched the checkout OFF (Shopify checkout is used)');
    }
    await logActivity(app, storeId, req.user!.id, 'payments.settings', 'Updated COD / partial COD settings');
    return read(storeId);
  });

  app.put(`${P}/gateways/:provider`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, provider: raw } = req.params as Params;
    const provider = String(raw).toUpperCase() as GatewayProviderKey;
    if (!available().includes(provider)) throw notFound('Unknown gateway.');
    const body = gatewayBody.safeParse(req.body);
    if (!body.success) throw badRequest('Check the gateway details.');
    const existing = await prisma.gatewayAccount.findUnique({ where: { storeId_provider: { storeId, provider } } });
    // Keep saved secrets the merchant did not retype (they are never shown back).
    const saved = existing?.credentialsEnc ? keyring.decryptJson<Record<string, string>>(existing.credentialsEnc) : {};
    const merged: Record<string, string> = { ...saved };
    for (const [k, v] of Object.entries(body.data.credentials)) if (v.trim()) merged[k] = v.trim();
    const creds = credentialSchemas[provider].safeParse(merged);
    if (!creds.success) {
      const issue = creds.error.issues[0];
      const field = GATEWAYS[provider].fields.find((f) => f.key === issue?.path[0]);
      throw badRequest(`${field?.label ?? 'A field'}: ${issue?.message ?? 'missing'}`, 'invalid_credentials');
    }
    const data = {
      mode: body.data.mode,
      active: body.data.active,
      credentialsEnc: provider === 'DEV' ? '' : keyring.encryptJson(creds.data),
      publicInfo: publicInfoOf(provider, creds.data as Record<string, string>),
    };
    await prisma.gatewayAccount.upsert({ where: { storeId_provider: { storeId, provider } }, create: { storeId, provider, ...data }, update: data });
    await logActivity(app, storeId, req.user!.id, 'gateway.save', `Saved ${GATEWAYS[provider].name} (${body.data.mode}, ${body.data.active ? 'on' : 'off'})`);
    return read(storeId);
  });

  app.delete(`${P}/gateways/:provider`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, provider: raw } = req.params as Params;
    const provider = String(raw).toUpperCase() as GatewayProviderKey;
    const deleted = await prisma.gatewayAccount.deleteMany({ where: { storeId, provider } });
    if (!deleted.count) throw notFound('Gateway not found.');
    await logActivity(app, storeId, req.user!.id, 'gateway.remove', `Removed ${GATEWAYS[provider]?.name ?? provider}`);
    return read(storeId);
  });

  app.put(`${P}/payment-routes`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const body = routesBody.safeParse(req.body);
    if (!body.success) throw badRequest('Check the routing table.');
    const accounts = await prisma.gatewayAccount.findMany({ where: { storeId } });
    const rows = Object.entries(body.data.routes).filter((e): e is [string, GatewayProviderKey] => !!e[1]);
    for (const [method, provider] of rows) {
      if (!(ONLINE_METHODS as readonly string[]).includes(method)) throw badRequest(`Unknown method ${method}.`);
      if (!accounts.some((a) => a.provider === provider)) throw badRequest(`Add ${GATEWAYS[provider].name} first.`);
    }
    await prisma.$transaction([
      prisma.paymentRoute.deleteMany({ where: { storeId } }),
      prisma.paymentRoute.createMany({ data: rows.map(([method, provider]) => ({ storeId, method, gatewayAccountId: accounts.find((a) => a.provider === provider)!.id })) }),
    ]);
    await logActivity(app, storeId, req.user!.id, 'payments.routes', 'Updated which gateway takes which payment method');
    return read(storeId);
  });
}
