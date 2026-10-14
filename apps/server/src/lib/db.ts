import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  client ??= new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
