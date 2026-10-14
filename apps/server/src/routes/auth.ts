import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { clearSession, requireUser, setSession } from '../plugins/auth.js';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});
const signup = credentials.extend({ name: z.string().trim().min(1).max(100) });

// A real hash of a random password: login with an unknown email costs the same time.
const DUMMY_HASH = hashPassword(`dummy-${Math.random()}-password`);

const authLimit = { rateLimit: { max: 10, timeWindow: '15 minutes' } };

export function authRoutes(app: FastifyInstance): void {
  app.post('/api/auth/signup', { config: authLimit }, async (req, reply) => {
    const body = signup.safeParse(req.body);
    if (!body.success) throw badRequest(body.error.issues[0]!.message);
    const { prisma } = app.deps;
    const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (exists) throw conflict('An account with this email already exists.', 'email_taken');
    const user = await prisma.user.create({
      data: { email: body.data.email, name: body.data.name, passwordHash: await hashPassword(body.data.password) },
    });
    await setSession(reply, user.id, user.tokenVersion);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/login', { config: authLimit }, async (req, reply) => {
    const body = credentials.safeParse(req.body);
    if (!body.success) throw unauthorized('Wrong email or password.');
    const { prisma } = app.deps;
    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    const ok = await verifyPassword(body.data.password, user?.passwordHash ?? (await DUMMY_HASH));
    if (!user || !ok) throw unauthorized('Wrong email or password.');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await setSession(reply, user.id, user.tokenVersion);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  /** Signs out every device: raises tokenVersion so all older cookies stop working. */
  app.post('/api/auth/logout-everywhere', { preHandler: requireUser }, async (req, reply) => {
    const user = await app.deps.prisma.user.update({
      where: { id: req.user!.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await setSession(reply, user.id, user.tokenVersion);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req) => {
    const memberships = await app.deps.prisma.storeMember.findMany({
      where: { userId: req.user!.id },
      include: { store: { select: { id: true, name: true, shopDomain: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      user: publicUser(req.user!),
      stores: memberships.map((m) => ({ ...m.store, role: m.role })),
    };
  });
}

function publicUser(u: { id: string; email: string; name: string | null }) {
  return { id: u.id, email: u.email, name: u.name };
}
