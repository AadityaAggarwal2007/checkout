/** Empties every table and loads the demo store. For the E2E database only — refuses anything else. */
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../src/dev/seed.js';

const url = process.env.DATABASE_URL ?? '';
if (!/_(e2e|test)\b/.test(url)) throw new Error('reset-and-seed only runs on a *_e2e or *_test database');
const prisma = new PrismaClient();
const rows = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
await seedDemo(prisma);
await prisma.$disconnect();
console.log('e2e database reset and seeded');
