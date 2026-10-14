/** npm run seed:dev — demo merchant + store for local development. */
import { PrismaClient } from '@prisma/client';
import { DEMO, seedDemo } from '../src/dev/seed.js';

if (process.env.NODE_ENV === 'production') throw new Error('never seed demo data in production');
const prisma = new PrismaClient();
const { storeId } = await seedDemo(prisma, { localCheckout: true, domain: new URL(process.env.DEV_STORE_URL ?? 'http://localhost:5004').host });
console.log(`Seeded store ${storeId}\n  login: ${DEMO.email} / ${DEMO.password}\n  widget key: ${DEMO.widgetKey}`);
await prisma.$disconnect();
