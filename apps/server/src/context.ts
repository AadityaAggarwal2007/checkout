import type { PrismaClient, StoreMember, User } from '@prisma/client';
import type { Env } from './env.js';
import type { Keyring } from './lib/crypto.js';
import type { ShopifyApi } from './lib/shopify.js';
import type { Tokens } from './lib/tokens.js';

/** Everything a route needs, injected once (tests pass fakes). */
export interface Deps {
  env: Env;
  prisma: PrismaClient;
  keyring: Keyring;
  tokens: Tokens;
  shopify: ShopifyApi;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
  interface FastifyRequest {
    rawBody?: Buffer;
    user?: User;
    member?: StoreMember;
  }
}
