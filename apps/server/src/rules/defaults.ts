import { defaultDrawerSettings } from '@checkout/shared';
import type { Prisma } from '@prisma/client';

/** Everything a new store needs to work on day one. Safe to call again (creates only what is missing). */
export async function ensureStoreDefaults(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
  await tx.storeSettings.upsert({ where: { storeId }, create: { storeId }, update: {} });
  const drawers = await tx.drawerConfig.count({ where: { storeId } });
  if (drawers === 0) {
    await tx.drawerConfig.create({
      data: { storeId, name: 'Default', isActive: true, config: defaultDrawerSettings() as Prisma.InputJsonValue },
    });
  }
  await tx.rtoSettings.upsert({ where: { storeId }, create: { storeId }, update: {} });
}
