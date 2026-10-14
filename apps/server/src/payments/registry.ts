import { GATEWAYS, type GatewayProviderKey } from '@checkout/shared';
import type { GatewayAccount, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { Keyring } from '../lib/crypto.js';
import { DevGateway } from './dev.js';
import { PayGlocalGateway, type PayGlocalCredentials } from './payglocal.js';
import { PayUGateway, type PayUCredentials } from './payu.js';
import type { FetchLike, Gateway } from './types.js';

const pem = (kind: 'PUBLIC KEY' | 'PRIVATE KEY') =>
  z.string().trim().refine((v) => v.includes(`-----BEGIN ${kind}-----`) && v.includes(`-----END ${kind}-----`), `Paste the full ${kind.toLowerCase()} (PEM)`);

/** Credentials as stored (encrypted) per provider. */
export const credentialSchemas = {
  PAYGLOCAL: z.object({
    merchantId: z.string().trim().min(2).max(100),
    publicKeyId: z.string().trim().min(2).max(200),
    privateKeyId: z.string().trim().min(2).max(200),
    payglocalPublicKey: pem('PUBLIC KEY'),
    merchantPrivateKey: pem('PRIVATE KEY'),
  }),
  PAYU: z.object({ key: z.string().trim().min(3).max(100), salt: z.string().trim().min(3).max(200) }),
  DEV: z.object({}),
} satisfies Record<GatewayProviderKey, z.ZodTypeAny>;

/** The non-secret fields, shown back in the dashboard. */
export function publicInfoOf(provider: GatewayProviderKey, creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of GATEWAYS[provider].fields) {
    const v = creds[f.key];
    if (!f.secret && v) out[f.key] = f.multiline ? `${v.split('\n')[0]?.slice(0, 40)}…` : v;
  }
  return out;
}

/** Builds the adapter for one store's gateway account (credentials decrypted on use, never cached in clear). */
export class GatewayRegistry {
  constructor(
    private readonly deps: { env: Env; prisma: PrismaClient; keyring: Keyring },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  devAllowed(): boolean {
    return this.deps.env.DEV_GATEWAY === '1' && this.deps.env.NODE_ENV !== 'production';
  }

  for(account: GatewayAccount): Gateway {
    const mode = account.mode === 'live' ? 'live' : 'test';
    switch (account.provider) {
      case 'PAYU':
        return new PayUGateway(this.deps.keyring.decryptJson<PayUCredentials>(account.credentialsEnc), mode, this.fetchImpl);
      case 'PAYGLOCAL':
        return new PayGlocalGateway(this.deps.keyring.decryptJson<PayGlocalCredentials>(account.credentialsEnc), mode, this.fetchImpl);
      case 'DEV':
        if (!this.devAllowed()) throw new Error('The test gateway is switched off on this server.');
        return new DevGateway(this.deps.prisma, this.deps.env.PUBLIC_URL);
    }
  }
}
