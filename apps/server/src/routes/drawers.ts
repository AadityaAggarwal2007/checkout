import { drawerSettingsSchema } from '@checkout/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const P = '/api/stores/:storeId/drawers';
type Params = { storeId: string; drawerId: string };

const createBody = z.object({ name: z.string().trim().min(1).max(60), copyFromId: z.string().optional() });
const updateBody = z.object({ name: z.string().trim().min(1).max(60).optional(), config: z.unknown().optional() });

export function drawerRoutes(app: FastifyInstance): void {
  const { prisma } = app.deps;

  async function load(storeId: string, drawerId: string) {
    const d = await prisma.drawerConfig.findFirst({ where: { id: drawerId, storeId } });
    if (!d) throw notFound('Drawer not found.');
    return d;
  }

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as Params;
    const drawers = await prisma.drawerConfig.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, isActive: true, version: true, createdAt: true, updatedAt: true },
    });
    return { drawers };
  });

  app.get(`${P}/:drawerId`, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId, drawerId } = req.params as Params;
    const d = await load(storeId, drawerId);
    return { drawer: { ...d, config: drawerSettingsSchema.parse(d.config) } };
  });

  app.post(P, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const body = createBody.safeParse(req.body);
    if (!body.success) throw badRequest('Give the drawer a name.');
    const from = body.data.copyFromId ? await load(storeId, body.data.copyFromId) : null;
    const config = drawerSettingsSchema.parse(from?.config ?? {});
    const drawer = await prisma.drawerConfig.create({
      data: { storeId, name: body.data.name, config: config as Prisma.InputJsonValue },
    });
    await log(app, storeId, req.user!.id, 'drawer.create', `Created drawer - ${drawer.name}`, drawer.id);
    return { drawer };
  });

  app.put(`${P}/:drawerId`, { preHandler: requireStore('STAFF') }, async (req) => {
    const { storeId, drawerId } = req.params as Params;
    const body = updateBody.safeParse(req.body);
    if (!body.success) throw badRequest('Invalid drawer.');
    await load(storeId, drawerId);
    let config: Prisma.InputJsonValue | undefined;
    if (body.data.config !== undefined) {
      const parsed = drawerSettingsSchema.safeParse(body.data.config);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        throw badRequest(`${issue.path.join(' › ')}: ${issue.message}`, 'invalid_config');
      }
      config = parsed.data as Prisma.InputJsonValue;
    }
    const drawer = await prisma.drawerConfig.update({
      where: { id: drawerId },
      data: { name: body.data.name, config, version: { increment: 1 } },
    });
    await log(app, storeId, req.user!.id, 'drawer.update', `Updated drawer - ${drawer.name}`, drawer.id);
    return { drawer: { ...drawer, config: drawerSettingsSchema.parse(drawer.config) } };
  });

  /** One active drawer per store: activating one switches the others off in the same transaction. */
  app.post(`${P}/:drawerId/activate`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, drawerId } = req.params as Params;
    const d = await load(storeId, drawerId);
    await prisma.$transaction([
      prisma.drawerConfig.updateMany({ where: { storeId, isActive: true }, data: { isActive: false } }),
      prisma.drawerConfig.update({ where: { id: drawerId }, data: { isActive: true, version: { increment: 1 } } }),
    ]);
    await log(app, storeId, req.user!.id, 'drawer.activate', `Activated drawer - ${d.name}`, d.id);
    return { ok: true };
  });

  app.delete(`${P}/:drawerId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, drawerId } = req.params as Params;
    const d = await load(storeId, drawerId);
    if (d.isActive) throw conflict('Activate another drawer before deleting this one.', 'drawer_active');
    await prisma.drawerConfig.delete({ where: { id: drawerId } });
    await log(app, storeId, req.user!.id, 'drawer.delete', `Deleted drawer - ${d.name}`, d.id);
    return { ok: true };
  });
}

async function log(app: FastifyInstance, storeId: string, userId: string, action: string, summary: string, targetId: string) {
  await app.deps.prisma.activityLog.create({ data: { storeId, userId, action, summary, targetId } });
}
