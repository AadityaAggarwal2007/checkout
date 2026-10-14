import type { FastifyInstance } from 'fastify';

export function healthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    await app.deps.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });
}
