import type { MemberRole } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'ck_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

const RANK: Record<MemberRole, number> = { VIEWER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 };

/** preHandler: loads the logged-in user (token valid AND tokenVersion still current). */
export async function requireUser(req: FastifyRequest): Promise<void> {
  const { tokens, prisma } = req.server.deps;
  const claims = await tokens.verify<{ sub: string; tv: number }>('session', req.cookies[SESSION_COOKIE]);
  if (!claims) throw unauthorized();
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.tokenVersion !== claims.tv) throw unauthorized();
  req.user = user;
}

/** preHandler factory: the user must be a member of :storeId with at least `role`. */
export function requireStore(role: MemberRole = 'VIEWER') {
  return async (req: FastifyRequest): Promise<void> => {
    if (!req.user) await requireUser(req);
    const storeId = (req.params as { storeId?: string }).storeId;
    if (!storeId) throw notFound();
    const member = await req.server.deps.prisma.storeMember.findUnique({
      where: { storeId_userId: { storeId, userId: req.user!.id } },
    });
    // Same answer for "no such store" and "not yours": never reveal other stores exist.
    if (!member && !req.user!.isPlatformAdmin) throw notFound('Store not found.');
    if (member && RANK[member.role] < RANK[role]) throw forbidden();
    req.member = member ?? undefined;
  };
}

export async function setSession(reply: FastifyReply, userId: string, tokenVersion: number): Promise<void> {
  const { tokens, env } = reply.server.deps;
  const token = await tokens.sign('session', { sub: userId, tv: tokenVersion }, SESSION_TTL_SECONDS);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.PUBLIC_URL.startsWith('https:'), // every https server, the demo too
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
