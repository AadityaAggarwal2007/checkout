import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { DevCatalog } from '../src/catalog/dev.js';
import type { Deps } from '../src/context.js';
import { loadEnv } from '../src/env.js';
import { Keyring } from '../src/lib/crypto.js';
import type { ShopifyApi } from '../src/lib/shopify.js';
import { Tokens } from '../src/lib/tokens.js';

export const TEST_DB = process.env.DATABASE_URL ?? 'postgresql://checkout:checkout@localhost:5432/checkout_test';

const key = () => randomBytes(32).toString('base64');
export const env = loadEnv({
  NODE_ENV: 'test',
  PUBLIC_URL: 'https://api.test',
  DASHBOARD_URL: 'https://dash.test',
  DATABASE_URL: TEST_DB,
  JWT_SECRET: key(),
  ENCRYPTION_KEYS: `k1:${key()}`,
  HASH_PEPPER: key(),
  SHOPIFY_API_KEY: 'test-api-key',
  SHOPIFY_API_SECRET: 'test-api-secret',
});

export const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });

export const fakeShopify: ShopifyApi & { calls: string[] } = {
  calls: [],
  async exchangeCode(shop, code) {
    this.calls.push(`exchange:${shop}:${code}`);
    return { accessToken: 'shpat_secret_token_value', scope: 'read_products,write_orders' };
  },
  async shopInfo(shop) {
    this.calls.push(`shop:${shop}`);
    return { name: 'Kurtiya Store', domain: 'www.kurtiya.shop', currency: 'INR' };
  },
};

export const devCatalog = new DevCatalog(fileURLToPath(new URL('../../devstore/catalog.json', import.meta.url)));

export async function makeApp(overrides: Partial<Deps> = {}): Promise<FastifyInstance> {
  return buildApp({
    env,
    prisma,
    keyring: new Keyring(env.ENCRYPTION_KEYS),
    tokens: new Tokens(env.JWT_SECRET),
    shopify: fakeShopify,
    catalog: devCatalog,
    ...overrides,
  });
}

/** Empties every table (fast, keeps the schema). */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  return hit?.split(';')[0]?.slice(name.length + 1);
}

export async function signup(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'correct horse', name: 'Test' } });
  if (res.statusCode !== 200) throw new Error(`signup failed: ${res.body}`);
  return cookieFrom(res, 'ck_session')!;
}
