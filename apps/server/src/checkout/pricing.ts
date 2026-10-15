import { isCashMethod, price, priceByMethod, type Cart, type PaymentMethod, type PricingResult } from '@checkout/core';
import { checkoutSettingsSchema, type CheckoutAddress, type CheckoutMethod } from '@checkout/shared';
import type { CheckoutSession, Customer, GatewayAccount, PaymentRoute, PrismaClient } from '@prisma/client';
import { loadStoreRules, shopperOf, usageOf, type StoreRules } from './rules.js';

export interface CouponState {
  codes: string[];
  removed: string[];
}

export const couponStateOf = (s: CheckoutSession): CouponState => {
  const raw = (s.couponState ?? {}) as Partial<CouponState>;
  return { codes: raw.codes ?? [], removed: raw.removed ?? [] };
};

export type SessionAddress = CheckoutAddress & { email?: string };

/** Everything needed to price one session: rules, gateways, who the shopper is. */
export interface PricingContext {
  rules: StoreRules;
  settings: ReturnType<typeof checkoutSettingsSchema.parse>;
  /** Online method -> the gateway account that takes it. */
  routes: Map<PaymentMethod, GatewayAccount>;
  /** Account used for the advance of partial COD. */
  partialAccount: GatewayAccount | null;
  customer: Customer | null;
}

const ONLINE: PaymentMethod[] = ['upi', 'card', 'netbanking', 'wallet', 'emi', 'pay_later'];

/**
 * Which gateway takes which method. An explicit route to an active gateway wins; every other online
 * method ("Automatic", or routed to a gateway that is now switched off) goes to the first active
 * gateway, as the dashboard says. Never "no payment method" while a gateway is on.
 */
export function routeTable(accounts: GatewayAccount[], routes: PaymentRoute[], devAllowed: boolean): Map<PaymentMethod, GatewayAccount> {
  // A real gateway always comes before the local test one (both on = real payments, test only as a spare).
  const usable = accounts.filter((a) => a.active && (a.provider !== 'DEV' || devAllowed)).sort((a, b) => Number(a.provider === 'DEV') - Number(b.provider === 'DEV'));
  const out = new Map<PaymentMethod, GatewayAccount>();
  for (const r of routes) {
    const acc = usable.find((a) => a.id === r.gatewayAccountId);
    if (acc && ONLINE.includes(r.method as PaymentMethod)) out.set(r.method as PaymentMethod, acc);
  }
  if (usable[0]) for (const m of ONLINE) if (!out.has(m)) out.set(m, usable[0]);
  return out;
}

export async function loadPricingContext(prisma: PrismaClient, storeId: string, customer: Customer | null, devAllowed: boolean): Promise<PricingContext> {
  const [rules, config, accounts, routes] = await Promise.all([
    loadStoreRules(prisma, storeId),
    prisma.checkoutConfig.findUnique({ where: { storeId } }),
    prisma.gatewayAccount.findMany({ where: { storeId, active: true }, orderBy: { createdAt: 'asc' } }),
    prisma.paymentRoute.findMany({ where: { storeId } }),
  ]);
  const table = routeTable(accounts, routes, devAllowed);
  return {
    rules,
    settings: checkoutSettingsSchema.parse(config?.config ?? {}),
    routes: table,
    partialAccount: table.get('upi') ?? [...table.values()][0] ?? null,
    customer,
  };
}

export interface SessionPricing {
  /** No method chosen: the summary (best price; cash methods may cost more). */
  plain: PricingResult;
  byMethod: Map<PaymentMethod, PricingResult>;
  methods: CheckoutMethod[];
}

/** Prices a cart for this shopper and address, for every method the store can take right now. */
export async function priceSession(
  prisma: PrismaClient,
  ctx: PricingContext,
  storeId: string,
  cart: Cart,
  coupons: CouponState,
  address: SessionAddress | null,
): Promise<SessionPricing> {
  const usage = await usageOf(prisma, storeId, ctx.rules.coupons, ctx.customer?.id ?? null);
  const input = {
    cart,
    coupons: ctx.rules.coupons,
    enteredCodes: coupons.codes,
    removedAutomaticIds: coupons.removed,
    shopper: shopperOf(ctx.customer),
    address: address ? { pincode: address.pincode, state: address.state, country: 'IN' } : undefined,
    shipping: ctx.rules.shipping,
    cod: ctx.rules.cod,
    rto: ctx.rules.rto,
    usage,
  };
  const plain = price(input);
  const hidden = new Set(ctx.settings.hiddenMethods);
  const offered = ctx.settings.methodOrder.filter((m) => {
    if (hidden.has(m)) return false;
    if (m === 'cod') return true; // priceByMethod drops it when COD is off / blocked
    if (m === 'partial_cod') return !!ctx.partialAccount;
    return ctx.routes.has(m);
  });
  const byMethod = plain.unserviceable ? new Map<PaymentMethod, PricingResult>() : priceByMethod(input, offered);
  // Partial COD with nothing left to pay on delivery is just a prepaid order.
  const partial = byMethod.get('partial_cod');
  if (partial && (partial.payOnDelivery === 0 || partial.payNow === 0)) byMethod.delete('partial_cod');

  const reference = byMethod.get('cod')?.total ?? plain.total;
  const methods: CheckoutMethod[] = [...byMethod.entries()].map(([method, r]) => ({
    method,
    total: r.total,
    payNow: r.payNow,
    payOnDelivery: r.payOnDelivery,
    codFee: r.codFee,
    extraSaving: isCashMethod(method) ? 0 : Math.max(0, reference - r.total),
  }));
  return { plain, byMethod, methods };
}
