import type { FastifyInstance } from 'fastify';

/** One line in the store's Activity log ("Saved PayU credentials"). Never put secrets in the summary. */
export async function logActivity(app: FastifyInstance, storeId: string, userId: string | undefined, action: string, summary: string, targetId?: string): Promise<void> {
  await app.deps.prisma.activityLog.create({ data: { storeId, userId, action, summary, targetId } });
}
