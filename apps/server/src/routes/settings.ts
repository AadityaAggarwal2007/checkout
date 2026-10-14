import type { MemberRole } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { pepperedHash, randomToken } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';

const RANK: Record<MemberRole, number> = { VIEWER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 };
const myRank = (req: FastifyRequest) => (req.member ? RANK[req.member.role] : RANK.OWNER); // platform admin = owner
type Params = { storeId: string; id?: string };

const pixelSchema = z.object({ enabled: z.boolean(), pixelId: z.string().trim().regex(/^\d{6,20}$/, 'A Meta Pixel id has only digits (e.g. 123456789012345)').or(z.literal('')) });
const memberSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email').max(200), role: z.enum(['ADMIN', 'STAFF', 'VIEWER']) });
const roleSchema = z.object({ role: z.enum(['ADMIN', 'STAFF', 'VIEWER']) });
const keySchema = z.object({ name: z.string().trim().min(1, 'Name the key').max(60) });

/** API key format: ck_live_<40 chars>. Only a peppered hash is stored; the key is shown once. */
export const API_KEY_PREFIX = 'ck_live_';
export const apiKeyHash = (pepper: string, key: string) => pepperedHash(pepper, `apikey:${key}`);

/** Settings > Integrations (Meta Pixel), Team, API keys, Activity log. */
export function settingsRoutes(app: FastifyInstance): void {
  const { prisma, env } = app.deps;
  const P = '/api/stores/:storeId';

  // ------------------------------------------------------------ integrations

  app.get(`${P}/integrations`, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as Params;
    const row = await prisma.integration.findUnique({ where: { storeId_kind: { storeId, kind: 'META_PIXEL' } } });
    return { metaPixel: { enabled: row?.enabled ?? false, pixelId: (row?.config as { pixelId?: string } | null)?.pixelId ?? '' } };
  });

  app.put(`${P}/integrations/meta-pixel`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const p = pixelSchema.safeParse(req.body);
    if (!p.success) throw badRequest(p.error.issues[0]?.message ?? 'Check the pixel id.');
    if (p.data.enabled && !p.data.pixelId) throw badRequest('Enter your Meta Pixel id to switch it on.');
    const data = { enabled: p.data.enabled, config: { pixelId: p.data.pixelId } };
    await prisma.integration.upsert({ where: { storeId_kind: { storeId, kind: 'META_PIXEL' } }, create: { storeId, kind: 'META_PIXEL', ...data }, update: data });
    await logActivity(app, storeId, req.user!.id, 'integration.meta_pixel', p.data.enabled ? 'Switched on Meta Pixel' : 'Switched off Meta Pixel');
    return { metaPixel: p.data };
  });

  // ------------------------------------------------------------ team

  async function team(storeId: string) {
    const rows = await prisma.storeMember.findMany({ where: { storeId }, include: { user: { select: { email: true, name: true, lastLoginAt: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => ({ id: m.id, userId: m.userId, email: m.user.email, name: m.user.name, role: m.role, lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null }));
  }

  app.get(`${P}/team`, { preHandler: requireStore('ADMIN') }, async (req) => ({ members: await team((req.params as Params).storeId), me: req.user!.id }));

  /** Adds someone who already has an account, by email. */
  app.post(`${P}/team`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const p = memberSchema.safeParse(req.body);
    if (!p.success) throw badRequest(p.error.issues[0]?.message ?? 'Check the email.');
    if (RANK[p.data.role] >= myRank(req)) throw forbidden('Only the owner can add admins.');
    // No account is made for someone else (an email nobody has proven): they sign up themselves first.
    const user = await prisma.user.findUnique({ where: { email: p.data.email } });
    if (!user) throw notFound(`No account with ${p.data.email} yet. Ask them to sign up first, then add them here.`);
    if (await prisma.storeMember.findUnique({ where: { storeId_userId: { storeId, userId: user.id } } })) throw conflict(`${p.data.email} is already in your team.`);
    await prisma.storeMember.create({ data: { storeId, userId: user.id, role: p.data.role } });
    await logActivity(app, storeId, req.user!.id, 'team.add', `Added ${p.data.email} as ${p.data.role.toLowerCase()}`);
    return { members: await team(storeId) };
  });

  async function member(req: FastifyRequest) {
    const { storeId, id } = req.params as Params;
    const m = id ? await prisma.storeMember.findFirst({ where: { id, storeId }, include: { user: { select: { email: true } } } }) : null;
    if (!m) throw notFound('This person is not in your team.');
    if (m.userId === req.user!.id) throw badRequest('You cannot change your own access.');
    if (RANK[m.role] >= myRank(req)) throw forbidden('Only the owner can change admins.');
    return m;
  }

  app.patch(`${P}/team/:id`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const m = await member(req);
    const p = roleSchema.safeParse(req.body);
    if (!p.success) throw badRequest('Choose a role.');
    if (RANK[p.data.role] >= myRank(req)) throw forbidden('Only the owner can make admins.');
    await prisma.storeMember.update({ where: { id: m.id }, data: { role: p.data.role } });
    await logActivity(app, storeId, req.user!.id, 'team.role', `Made ${m.user.email} ${p.data.role.toLowerCase()}`);
    return { members: await team(storeId) };
  });

  app.delete(`${P}/team/:id`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const m = await member(req);
    await prisma.storeMember.delete({ where: { id: m.id } });
    await logActivity(app, storeId, req.user!.id, 'team.remove', `Removed ${m.user.email}`);
    return { members: await team(storeId) };
  });

  // ------------------------------------------------------------ API keys

  const keys = async (storeId: string) =>
    (await prisma.apiKey.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } })).map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revoked: !!k.revokedAt,
    }));

  app.get(`${P}/api-keys`, { preHandler: requireStore('ADMIN') }, async (req) => ({ keys: await keys((req.params as Params).storeId) }));

  app.post(`${P}/api-keys`, { preHandler: requireStore('OWNER') }, async (req) => {
    const { storeId } = req.params as Params;
    const p = keySchema.safeParse(req.body);
    if (!p.success) throw badRequest(p.error.issues[0]?.message ?? 'Name the key.');
    if ((await prisma.apiKey.count({ where: { storeId, revokedAt: null } })) >= 10) throw badRequest('A store can have up to 10 active keys.');
    const key = `${API_KEY_PREFIX}${randomToken(30)}`;
    await prisma.apiKey.create({ data: { storeId, name: p.data.name, prefix: key.slice(0, 12), keyHash: apiKeyHash(env.HASH_PEPPER, key) } });
    await logActivity(app, storeId, req.user!.id, 'apikey.create', `Created API key "${p.data.name}"`);
    return { key, keys: await keys(storeId) };
  });

  app.delete(`${P}/api-keys/:id`, { preHandler: requireStore('OWNER') }, async (req) => {
    const { storeId, id } = req.params as Params;
    const k = await prisma.apiKey.findFirst({ where: { id, storeId, revokedAt: null } });
    if (!k) throw notFound('This key does not exist.');
    await prisma.apiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
    await logActivity(app, storeId, req.user!.id, 'apikey.revoke', `Revoked API key "${k.name}"`);
    return { keys: await keys(storeId) };
  });

  // ------------------------------------------------------------ activity log

  const activityQuery = z.object({ cursor: z.string().max(40).optional() });
  app.get(`${P}/activity`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const q = activityQuery.safeParse(req.query);
    if (!q.success) throw badRequest('Bad page.');
    const rows = await prisma.activityLog.findMany({
      where: { storeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(q.data.cursor ? { cursor: { id: q.data.cursor }, skip: 1 } : {}),
      include: { user: { select: { email: true, name: true } } },
    });
    return {
      items: rows.slice(0, 50).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), action: r.action, summary: r.summary, by: r.user?.name ?? r.user?.email ?? 'System' })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  });
}
