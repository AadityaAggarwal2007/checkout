/**
 * Payment gateways a store can connect (v1: PayGlocal, PayU; DEV only on a local server).
 * The dashboard draws the credential form from this list; the server validates against it.
 * Secret fields are write-only: the server never sends them back.
 */
export type GatewayProviderKey = 'PAYGLOCAL' | 'PAYU' | 'DEV';

export interface GatewayField {
  key: string;
  label: string;
  /** Secret = stored encrypted, never shown again (only "saved"). */
  secret: boolean;
  multiline?: boolean;
  help?: string;
}

export const GATEWAYS: Record<GatewayProviderKey, { name: string; fields: GatewayField[]; webhookHelp?: string }> = {
  PAYGLOCAL: {
    name: 'PayGlocal',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', secret: false },
      { key: 'publicKeyId', label: 'PayGlocal public key ID (kid)', secret: false },
      { key: 'privateKeyId', label: 'Your private key ID (kid)', secret: false },
      { key: 'payglocalPublicKey', label: 'PayGlocal public key (PEM)', secret: false, multiline: true, help: 'Starts with -----BEGIN PUBLIC KEY-----' },
      { key: 'merchantPrivateKey', label: 'Your private key (PEM)', secret: true, multiline: true, help: 'Starts with -----BEGIN PRIVATE KEY-----' },
    ],
  },
  PAYU: {
    name: 'PayU',
    fields: [
      { key: 'key', label: 'Merchant key', secret: false },
      { key: 'salt', label: 'Merchant salt (v1)', secret: true },
    ],
  },
  DEV: { name: 'Test gateway (local only)', fields: [] },
};

/** Online methods a store can route to a gateway (cash methods need no gateway, partial COD uses the UPI route). */
export const ONLINE_METHOD_LABELS = {
  upi: 'UPI',
  card: 'Debit / Credit card',
  netbanking: 'Net banking',
  wallet: 'Wallets',
  emi: 'EMI',
  pay_later: 'Pay later',
} as const;

export const METHOD_LABELS: Record<string, string> = {
  ...ONLINE_METHOD_LABELS,
  cod: 'Cash on delivery',
  partial_cod: 'Pay part now, rest on delivery',
};
