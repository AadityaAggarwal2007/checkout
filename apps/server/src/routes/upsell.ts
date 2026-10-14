import { describeUpsell, upsellInputSchema, upsellRuleSchema, type UpsellRuleView } from '@checkout/shared';
import type { Prisma, UpsellRule } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/upsells';
type Params = { storeId: string; ruleId?: string };
const patchSchema = z.object({ active: z.boolean().optional(), priority: z.number().int().min(0).max(1000).optional() }).strict();

function view(r: UpsellRule): UpsellRuleView | null {
  const rule = upsellRuleSchema.safeParse(r.rule);
  if (!rule.success) return null;
  return { id: r.id, name: r.name, active: r.active, priority: r.priority, rule: rule.data, text: describeUpsell(rule.data) };
}

/** Dashboard > Upsell: WHEN the cart has … → SHOW these products in the checkout, x% off, with a timer. */
export function upsellRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  async function own(storeId: string, ruleId: string | undefined): Promise<UpsellRule> {
    const r = ruleId ? await prisma.upsellRule.findFirst({ where: { id: ruleId, storeId } }) : null;
    if (!r) throw notFound('This upsell does not exist.');
    return r;
  }
  function parse(body: unknown) {
    const p = upsellInputSchema.safeParse(body);
    if (!p.success) throw badRequest(p.error.issues[0]?.message ?? 'Check the upsell.');
    return p.data;
  }

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as Params;
    const rows = await prisma.upsellRule.findMany({ where: { storeId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] });
    return { upsells: rows.map(view).filter(Boolean) };
  });

  app.post(P, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const d = parse(req.body);
    if ((await prisma.upsellRule.count({ where: { storeId } })) >= 50) throw badRequest('A store can have up to 50 upsells.');
    const r = await prisma.upsellRule.create({ data: { storeId, name: d.name, active: d.active, priority: d.priority, rule: d.rule as unknown as Prisma.InputJsonValue } });
    await logActivity(app, storeId, req.user!.id, 'upsell.create', `Added upsell "${r.name}"`);
    return { upsell: view(r) };
  });

  app.put(`${P}/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    const d = parse(req.body);
    const r = await prisma.upsellRule.update({ where: { id: old.id }, data: { name: d.name, active: d.active, priority: d.priority, rule: d.rule as unknown as Prisma.InputJsonValue } });
    await logActivity(app, storeId, req.user!.id, 'upsell.update', `Edited upsell "${r.name}"`);
    return { upsell: view(r) };
  });

  app.patch(`${P}/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    const p = patchSchema.safeParse(req.body);
    if (!p.success) throw badRequest('Nothing to change.');
    const r = await prisma.upsellRule.update({ where: { id: old.id }, data: p.data });
    if (p.data.active !== undefined) await logActivity(app, storeId, req.user!.id, 'upsell.toggle', `${r.active ? 'Turned on' : 'Turned off'} upsell "${r.name}"`);
    return { upsell: view(r) };
  });

  app.delete(`${P}/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    await prisma.upsellRule.delete({ where: { id: old.id } });
    await logActivity(app, storeId, req.user!.id, 'upsell.delete', `Deleted upsell "${old.name}"`);
    return { ok: true };
  });
}
