import type { PrismaClient, StoreMember, User } from '@prisma/client';
import type { PincodeLookup } from './address/pincode.js';
import type { Catalog } from './catalog/types.js';
import type { Env } from './env.js';
import type { Keyring } from './lib/crypto.js';
import type { OtpSender } from './messaging/otp-sender.js';
import type { OrderSink } from './orders/sink.js';
import type { GatewayRegistry } from './payments/registry.js';
import type { ShopifyApi } from './lib/shopify.js';
import type { Tokens } from './lib/tokens.js';

/** Everything a route needs, injected once (tests pass fakes). */
export interface Deps {
  env: Env;
  prisma: PrismaClient;
  keyring: Keyring;
  tokens: Tokens;
  shopify: ShopifyApi;
  catalog: Catalog;
  otp: OtpSender;
  gateways: GatewayRegistry;
  orderSink: OrderSink;
  pincodes: PincodeLookup;
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
