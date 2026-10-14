import { describeRto, rtoRuleInputSchema, type RtoConditionInput, type RtoRuleView } from '@checkout/shared';
import type { Prisma, RtoRule } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/rto';
type Params = { storeId: string; ruleId?: string };

const modeSchema = z.object({ mode: z.enum(['all', 'single']) });
const patchSchema = z.object({ active: z.boolean().optional(), priority: z.number().int().min(0).max(1000).optional() }).strict();

function view(r: RtoRule): RtoRuleView & { text: string } {
  const condition = r.condition as unknown as RtoConditionInput;
  return { id: r.id, name: r.name, active: r.active, priority: r.priority, condition, blockCod: r.blockCod, blockPartialCod: r.blockPartialCod, text: describeRto(condition) };
}

/** RTO suite: rules that switch COD (or partial COD) off for risky orders. The checkout reads them live. */
export function rtoRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  async function read(storeId: string) {
    const [settings, rules] = await Promise.all([
      prisma.rtoSettings.findUnique({ where: { storeId } }),
      prisma.rtoRule.findMany({ where: { storeId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    ]);
    return { mode: settings?.mode === 'single' ? 'single' : 'all', rules: rules.map(view) };
  }

  async function own(storeId: string, ruleId: string | undefined): Promise<RtoRule> {
    const r = ruleId ? await prisma.rtoRule.findFirst({ where: { id: ruleId, storeId } }) : null;
    if (!r) throw notFound('This rule does not exist.');
    return r;
  }

  function parse(body: unknown) {
    const p = rtoRuleInputSchema.safeParse(body);
    if (!p.success) throw badRequest(p.error.issues[0]?.message ?? 'Check the rule.');
    return p.data;
  }

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => read((req.params as Params).storeId));

  app.put(`${P}/settings`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const p = modeSchema.safeParse(req.body);
    if (!p.success) throw badRequest('Choose how the rules work together.');
    await prisma.rtoSettings.upsert({ where: { storeId }, create: { storeId, mode: p.data.mode }, update: { mode: p.data.mode } });
    await logActivity(app, storeId, req.user!.id, 'rto.mode', p.data.mode === 'all' ? 'RTO: every matching rule applies' : 'RTO: only the top rule applies');
    return read(storeId);
  });

  app.post(`${P}/rules`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const d = parse(req.body);
    if ((await prisma.rtoRule.count({ where: { storeId } })) >= 100) throw badRequest('A store can have up to 100 RTO rules.');
    const r = await prisma.rtoRule.create({ data: { storeId, name: d.name, active: d.active, priority: d.priority, condition: d.condition as unknown as Prisma.InputJsonValue, blockCod: d.blockCod, blockPartialCod: d.blockPartialCod } });
    await logActivity(app, storeId, req.user!.id, 'rto.create', `Added RTO rule "${r.name}"`);
    return { rule: view(r) };
  });

  app.put(`${P}/rules/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    const d = parse(req.body);
    const r = await prisma.rtoRule.update({ where: { id: old.id }, data: { name: d.name, active: d.active, priority: d.priority, condition: d.condition as unknown as Prisma.InputJsonValue, blockCod: d.blockCod, blockPartialCod: d.blockPartialCod } });
    await logActivity(app, storeId, req.user!.id, 'rto.update', `Edited RTO rule "${r.name}"`);
    return { rule: view(r) };
  });

  app.patch(`${P}/rules/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    const p = patchSchema.safeParse(req.body);
    if (!p.success) throw badRequest('Nothing to change.');
    const r = await prisma.rtoRule.update({ where: { id: old.id }, data: p.data });
    if (p.data.active !== undefined) await logActivity(app, storeId, req.user!.id, 'rto.toggle', `${r.active ? 'Turned on' : 'Turned off'} RTO rule "${r.name}"`);
    return { rule: view(r) };
  });

  app.delete(`${P}/rules/:ruleId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, ruleId } = req.params as Params;
    const old = await own(storeId, ruleId);
    await prisma.rtoRule.delete({ where: { id: old.id } });
    await logActivity(app, storeId, req.user!.id, 'rto.delete', `Deleted RTO rule "${old.name}"`);
    return { ok: true };
  });
}
