import type { PrismaClient } from '@prisma/client';
import { rupees, type Gateway, type GatewayStart, type GatewayStatus, type PaymentRequest, type UpiIntentRequest, type UpiIntentStart } from './types.js';

/**
 * Local test gateway: our own page with "Pay" / "Fail" buttons (/checkout/dev-gateway/:ref).
 * The choice is stored on the transaction; status() reads it back like a real status API would.
 * Only exists when DEV_GATEWAY=1, which the env check refuses in production.
 */
export class DevGateway implements Gateway {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly publicUrl: string,
  ) {}

  async start(req: PaymentRequest): Promise<GatewayStart> {
    return { kind: 'redirect', url: `${this.publicUrl}/checkout/dev-gateway/${encodeURIComponent(req.merchantRef)}`, gatewayRef: `dev_${req.merchantRef}` };
  }

  /** Like PayU's S2S intent, so local runs and e2e tests see the QR in the page; "paying" it = the Pay button on the test page. */
  async startUpiIntent(req: UpiIntentRequest): Promise<UpiIntentStart | null> {
    const q = new URLSearchParams({ pa: 'test@dev', pn: 'Test gateway', am: rupees(req.amount), tr: req.merchantRef, cu: 'INR' });
    return { intent: `upi://pay?${q.toString().replace(/\+/g, '%20')}`, gatewayRef: `dev_${req.merchantRef}` };
  }

  async status(merchantRef: string): Promise<GatewayStatus> {
    const txn = await this.prisma.paymentTransaction.findUnique({ where: { merchantRef } });
    const dev = (txn?.raw as { dev?: string } | null)?.dev;
    return {
      state: dev === 'success' ? 'success' : dev === 'failed' ? 'failed' : 'pending',
      amount: dev === 'success' ? txn?.amount : undefined,
      gatewayRef: `dev_${merchantRef}`,
      method: txn?.method ?? undefined,
      raw: { dev: dev ?? 'pending' },
    };
  }

  refFromCallback(_body: Record<string, unknown>, query: Record<string, unknown>): string | null {
    return typeof query.ref === 'string' ? query.ref : null;
  }
}
