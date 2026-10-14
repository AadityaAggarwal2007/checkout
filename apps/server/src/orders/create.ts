import { percentOf, type Cart, type PaymentMethod, type PricingResult } from '@checkout/core';
import { Prisma, type Order, type PrismaClient } from '@prisma/client';
import type { SessionAddress } from '../checkout/pricing.js';
import type { OrderSink } from './sink.js';

/** What an order is made from: frozen when the shopper pressed pay (stored on the payment). */
export interface OrderDraft {
  method: PaymentMethod;
  mode: 'PREPAID' | 'COD' | 'PARTIAL_COD';
  cart: Cart;
  pricing: PricingResult;
  address: SessionAddress;
  phone: string;
  /** Gift titles / pictures from the catalog (the coupon may hold only ids). */
  giftInfo?: Record<string, { title?: string; image?: string }>;
}

export const modeOf = (method: PaymentMethod): OrderDraft['mode'] => (method === 'cod' ? 'COD' : method === 'partial_cod' ? 'PARTIAL_COD' : 'PREPAID');

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Creates the order for a session exactly once (Order.sessionId is unique: two parallel
 * confirmations of the same payment end with one order). Also records coupon uses, the
 * shopper's counters and our 1% usage charge, all in one transaction.
 */
export async function createOrder(
  prisma: PrismaClient,
  args: { storeId: string; sessionId: string; customerId: string | null; draft: OrderDraft; paidAmount: number; transactionId?: string; note?: string | null; attribution?: Prisma.JsonValue },
): Promise<{ order: Order; created: boolean }> {
  const { draft } = args;
  const p = draft.pricing;
  const existing = await prisma.order.findUnique({ where: { sessionId: args.sessionId } });
  if (existing) return { order: existing, created: false };

  try {
    const order = await prisma.$transaction(async (tx) => {
      const [seq] = await tx.$queryRaw<Array<{ n: number; prefix: string; rate: number }>>`
        UPDATE "StoreSettings" SET "nextOrderNumber" = "nextOrderNumber" + 1
        WHERE "storeId" = ${args.storeId}
        RETURNING "nextOrderNumber" - 1 AS n, "orderPrefix" AS prefix, "billingRateBps" AS rate`;
      if (!seq) throw new Error('store settings missing');

      const lines = draft.cart.lines.map((l) => {
        const priced = p.lines.find((x) => x.lineId === l.lineId);
        return {
          productId: l.productId,
          variantId: l.variantId,
          title: l.title,
          variantTitle: l.variantTitle ?? null,
          image: l.image ?? null,
          sku: l.sku ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          compareAtPrice: l.compareAtPrice ?? null,
          discount: priced?.discount ?? 0,
          total: priced?.total ?? l.unitPrice * l.quantity,
          isGift: false,
        };
      });
      for (const g of p.gifts) {
        const info = draft.giftInfo?.[g.variantId];
        lines.push({
          productId: g.productId,
          variantId: g.variantId,
          title: info?.title ?? g.title ?? 'Free gift',
          variantTitle: null,
          image: info?.image ?? g.image ?? null,
          sku: null,
          quantity: g.quantity,
          unitPrice: g.unitPrice,
          compareAtPrice: null,
          discount: g.unitPrice * g.quantity,
          total: 0,
          isGift: true,
        });
      }

      const status = draft.mode === 'PREPAID' ? 'PAID' : draft.mode === 'PARTIAL_COD' ? 'PARTIALLY_PAID' : 'COD_CONFIRMED';
      const created = await tx.order.create({
        data: {
          storeId: args.storeId,
          sessionId: args.sessionId,
          customerId: args.customerId,
          number: `${seq.prefix}${seq.n}`,
          paymentMode: draft.mode,
          paymentStatus: status,
          paymentMethod: draft.method,
          contactName: draft.address.name,
          contactPhone: draft.phone,
          contactEmail: draft.address.email || null,
          shippingAddress: { ...draft.address, phone: draft.phone } as Prisma.InputJsonValue,
          note: args.note ?? null,
          subtotal: p.subtotal,
          discount: p.discount,
          shipping: p.shipping?.charge ?? 0,
          codFee: p.codFee,
          total: p.total,
          paidAmount: args.paidAmount,
          dueOnDelivery: p.payOnDelivery,
          couponCodes: p.applied.map((a) => a.code ?? a.title ?? 'Offer'),
          pricing: p as unknown as Prisma.InputJsonValue,
          attribution: (args.attribution ?? undefined) as Prisma.InputJsonValue | undefined,
          lines: { create: lines },
        },
      });

      for (const a of p.applied) {
        await tx.couponRedemption.create({
          data: { couponId: a.couponId, storeId: args.storeId, orderId: created.id, customerId: args.customerId, amount: a.amount },
        });
      }
      if (args.customerId) {
        await tx.customer.update({
          where: { id: args.customerId },
          data: {
            orderCount: { increment: 1 },
            codOrderCount: draft.mode === 'PREPAID' ? undefined : { increment: 1 },
            lifetimeSpend: { increment: p.total },
            lastOrderAt: new Date(),
            name: draft.address.name,
            email: draft.address.email || undefined,
          },
        });
      }
      // Billing: our fee on every successful order (owner: 1%), waived later if it is cancelled.
      await tx.usageCharge.create({
        data: { storeId: args.storeId, orderId: created.id, orderTotal: p.total, rateBps: seq.rate, amount: percentOf(p.total, seq.rate / 100) },
      });
      if (args.transactionId) await tx.paymentTransaction.update({ where: { id: args.transactionId }, data: { orderId: created.id } });
      await tx.checkoutSession.update({ where: { id: args.sessionId }, data: { status: 'COMPLETED', step: 'COMPLETED', completedAt: new Date(), total: p.total } });
      return created;
    });
    return { order, created: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const order = await prisma.order.findUnique({ where: { sessionId: args.sessionId } });
      if (order) return { order, created: false };
    }
    throw err;
  }
}

/** Sends the order to Shopify; a failure is kept on the order and retried by the job. */
export async function pushOrderToShopify(prisma: PrismaClient, sink: OrderSink, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true, store: true, transactions: { select: { status: true, gatewayRef: true, provider: true, method: true } } } }).catch(() => null);
  if (!order || order.shopifyOrderId) return;
  try {
    const { id, name } = await sink.create(order, order.store.shopDomain, order.storeId);
    await prisma.order.update({ where: { id: order.id }, data: { shopifyOrderId: id, shopifyName: name, shopifyError: null } });
  } catch (err) {
    // Runs in the background (not awaited): it must never throw.
    await prisma.order
      .update({ where: { id: order.id }, data: { shopifyError: String((err as Error).message ?? err).slice(0, 500) } })
      .catch(() => undefined);
  }
}

/** Retries orders that did not reach Shopify yet (last 3 days, a few at a time). */
export async function retryShopifyOrders(prisma: PrismaClient, sink: OrderSink): Promise<number> {
  const pending = await prisma.order.findMany({
    where: { shopifyOrderId: null, createdAt: { gt: new Date(Date.now() - 3 * 86_400_000), lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: 20,
    // Least recently tried first: each failure bumps updatedAt, so orders Shopify keeps refusing cannot
    // block newer ones (at 2000 orders a day a bad hour can leave more than 20 waiting).
    orderBy: { updatedAt: 'asc' },
  });
  for (const o of pending) await pushOrderToShopify(prisma, sink, o.id);
  return pending.length;
}
